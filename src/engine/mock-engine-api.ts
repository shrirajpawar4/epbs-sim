import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { PayloadStore } from './payload-store.ts'
import type {
  ForkchoiceStateV3,
  ForkchoiceUpdatedV3Result,
  GetPayloadV3Result,
  JsonRpcErrorResponse,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  NewPayloadV3Params,
  NewPayloadV3Result,
  PayloadAttributesV3
} from '../types.ts'

export type RpcLogger = (message: string) => void

interface CallEngineRpcOptions {
  logger?: RpcLogger
}

function formatSimTime(timeMs: number): string {
  return `t=${(timeMs / 1000).toFixed(1)}s`
}

async function readJsonBody(request: IncomingMessage): Promise<JsonRpcRequest> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonRpcRequest
}

function writeJson(response: ServerResponse, payload: JsonRpcSuccessResponse<unknown> | JsonRpcErrorResponse): void {
  response.statusCode = 200
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(payload))
}

function simTimeMs(request: IncomingMessage): number {
  const raw = request.headers['x-sim-time-ms']
  const value = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export class MockEngineApiServer {
  private readonly server: Server
  private port: number | null = null

  constructor(private readonly store: PayloadStore) {
    this.server = createServer((request, response) => {
      void this.handle(request, response)
    })
  }

  get url(): string {
    if (this.port === null) throw new Error('mock engine server not started')
    return `http://127.0.0.1:${this.port}`
  }

  async start(): Promise<void> {
    if (this.port !== null) return

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject)
        const address = this.server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('failed to bind mock engine api server'))
          return
        }

        this.port = address.port
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (this.port === null) return

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
    this.port = null
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      response.statusCode = 405
      response.end()
      return
    }

    try {
      const body = await readJsonBody(request)
      const timeMs = simTimeMs(request)
      const result = this.dispatch(body.method, body.params ?? [], timeMs)
      writeJson(response, {
        jsonrpc: '2.0',
        id: body.id,
        result
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown engine api error'
      writeJson(response, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32000,
          message
        }
      })
    }
  }

  private dispatch(method: string, params: unknown[], timeMs: number): unknown {
    if (method === 'engine_forkchoiceUpdatedV3') {
      const [, payloadAttributes] = params as [ForkchoiceStateV3, PayloadAttributesV3]
      const record = this.store.createBuild(payloadAttributes, timeMs)
      const result: ForkchoiceUpdatedV3Result = {
        payloadStatus: 'VALID',
        payloadId: record.payloadId
      }
      return result
    }

    if (method === 'engine_getPayloadV3') {
      const [payloadId] = params as [string]
      return this.store.getPayload(payloadId, timeMs) satisfies GetPayloadV3Result
    }

    if (method === 'engine_newPayloadV3') {
      const [payloadParams] = params as [NewPayloadV3Params]
      return this.store.validateNewPayload(payloadParams, timeMs) satisfies NewPayloadV3Result
    }

    throw new Error(`unsupported engine method ${method}`)
  }
}

export async function callEngineRpc<TResult>(
  engineUrl: string,
  method: string,
  params: unknown[],
  timeMs: number,
  options: CallEngineRpcOptions = {}
): Promise<TResult> {
  const requestBody: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params
  }

  options.logger?.(`[rpc] -> ${engineUrl} ${formatSimTime(timeMs)} ${JSON.stringify(requestBody)}`)

  const response = await fetch(engineUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sim-time-ms': String(timeMs)
    },
    body: JSON.stringify(requestBody)
  })

  const payload = (await response.json()) as JsonRpcSuccessResponse<TResult> | JsonRpcErrorResponse
  options.logger?.(`[rpc] <- ${engineUrl} ${formatSimTime(timeMs)} ${JSON.stringify(payload)}`)
  if ('error' in payload) throw new Error(payload.error.message)
  return payload.result
}
