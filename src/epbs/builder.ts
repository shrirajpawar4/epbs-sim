import { createHash } from 'node:crypto'

import { callEngineRpc, type RpcLogger } from '../engine/mock-engine-api.ts'
import type { ExecutionPayloadEnvelope, GetPayloadV3Result } from '../types.ts'

function mutateHex(input: string): string {
  return `0x${createHash('sha256').update(input).digest('hex')}`
}

export async function fetchPayloadEnvelope(
  engineUrl: string,
  payloadId: string,
  builderId: string,
  fetchAtMs: number,
  rpcLogger?: RpcLogger
): Promise<ExecutionPayloadEnvelope> {
  const result = await callEngineRpc<GetPayloadV3Result>(
    engineUrl,
    'engine_getPayloadV3',
    [payloadId],
    fetchAtMs,
    { logger: rpcLogger }
  )
  return {
    payloadId,
    builderId,
    executionPayload: result.executionPayload,
    blobsBundle: result.blobsBundle,
    broadcastAtMs: fetchAtMs,
    variant: 'primary'
  }
}

export function withBroadcastDelay(
  envelope: ExecutionPayloadEnvelope,
  broadcastAtMs: number
): ExecutionPayloadEnvelope {
  return {
    ...envelope,
    broadcastAtMs
  }
}

export function createEquivocationEnvelope(
  envelope: ExecutionPayloadEnvelope,
  broadcastAtMs: number
): ExecutionPayloadEnvelope {
  const conflictedHash = mutateHex(`${envelope.executionPayload.blockHash}:equivocation`)
  return {
    ...envelope,
    broadcastAtMs,
    variant: 'equivocation',
    executionPayload: {
      ...envelope.executionPayload,
      blockHash: conflictedHash,
      stateRoot: mutateHex(`${conflictedHash}:state`),
      receiptsRoot: mutateHex(`${conflictedHash}:receipts`),
      transactions: envelope.executionPayload.transactions.map((tx, index) => mutateHex(`${tx}:${index}:equivocated`))
    },
    blobsBundle: {
      commitments: envelope.blobsBundle.commitments.map((commitment, index) => mutateHex(`${commitment}:${index}:equivocated`)),
      proofs: envelope.blobsBundle.proofs.map((proof, index) => mutateHex(`${proof}:${index}:equivocated`)),
      blobs: envelope.blobsBundle.blobs.map((blob, index) => mutateHex(`${blob}:${index}:equivocated`))
    }
  }
}
