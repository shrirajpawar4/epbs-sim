import { afterEach, describe, expect, it } from 'vitest'

import { callEngineRpc, MockEngineApiServer } from '../src/engine/mock-engine-api.ts'
import { PayloadStore } from '../src/engine/payload-store.ts'
import type {
  ForkchoiceUpdatedV3Result,
  GetPayloadV3Result,
  NewPayloadV3Result,
  PayloadAttributesV3
} from '../src/types.ts'

describe('MockEngineApiServer', () => {
  let server: MockEngineApiServer | null = null

  afterEach(async () => {
    if (server) await server.stop()
    server = null
  })

  it('serves the three Engine methods over JSON-RPC', async () => {
    server = new MockEngineApiServer(new PayloadStore())
    await server.start()

    const payloadAttributes: PayloadAttributesV3 = {
      timestamp: 12,
      prevRandao: '0x01',
      suggestedFeeRecipient: '0x00000000000000000000000000000000fee1dead',
      parentBeaconBlockRoot: '0x02',
      slot: 1,
      builderId: 'builder-0'
    }

    const fcu = await callEngineRpc<ForkchoiceUpdatedV3Result>(
      server.url,
      'engine_forkchoiceUpdatedV3',
      [
        {
          headBlockHash: '0x03',
          safeBlockHash: '0x03',
          finalizedBlockHash: '0x03'
        },
        payloadAttributes
      ],
      0
    )
    const payload = await callEngineRpc<GetPayloadV3Result>(server.url, 'engine_getPayloadV3', [fcu.payloadId], 6_000)
    const validation = await callEngineRpc<NewPayloadV3Result>(
      server.url,
      'engine_newPayloadV3',
      [
        {
          executionPayload: payload.executionPayload,
          blobsBundle: payload.blobsBundle
        }
      ],
      6_000
    )

    expect(fcu.payloadStatus).toBe('VALID')
    expect(payload.executionPayload.blockHash).toMatch(/^0x[0-9a-f]+$/)
    expect(validation.status).toBe('VALID')
  })
})
