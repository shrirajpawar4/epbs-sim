import { describe, expect, it } from 'vitest'

import { PayloadStore } from '../src/engine/payload-store.ts'
import type { ExecutionPayloadEnvelope, PayloadAttributesV3 } from '../src/types.ts'

function basePayloadAttributes(): PayloadAttributesV3 {
  return {
    timestamp: 12,
    prevRandao: '0x01',
    suggestedFeeRecipient: '0x00000000000000000000000000000000fee1dead',
    parentBeaconBlockRoot: '0x02',
    slot: 1,
    builderId: 'builder-0'
  }
}

describe('PayloadStore', () => {
  it('creates builds and returns payloads by payloadId', () => {
    const store = new PayloadStore()
    const build = store.createBuild(basePayloadAttributes(), 0)
    const result = store.getPayload(build.payloadId, 6_000)

    expect(build.payloadId).toBeTruthy()
    expect(result.executionPayload.blockHash).toBe(build.blockHash)
    expect(store.snapshotByPayloadId(build.payloadId)?.state).toBe('FETCHED')
  })

  it('marks the build equivocated when a second distinct envelope arrives', () => {
    const store = new PayloadStore()
    const build = store.createBuild(basePayloadAttributes(), 0)
    const result = store.getPayload(build.payloadId, 6_000)

    const primaryEnvelope: ExecutionPayloadEnvelope = {
      payloadId: build.payloadId,
      builderId: build.builderId,
      executionPayload: result.executionPayload,
      blobsBundle: result.blobsBundle,
      broadcastAtMs: 6_000,
      variant: 'primary'
    }
    const conflictingEnvelope: ExecutionPayloadEnvelope = {
      ...primaryEnvelope,
      broadcastAtMs: 6_100,
      variant: 'equivocation',
      executionPayload: {
        ...primaryEnvelope.executionPayload,
        blockHash: '0xdeadbeef'
      }
    }

    store.recordEnvelope(build.payloadId, primaryEnvelope)
    const updated = store.recordEnvelope(build.payloadId, conflictingEnvelope)

    expect(updated.state).toBe('EQUIVOCATED')
    expect(updated.envelopes).toHaveLength(2)
    expect(store.snapshotByBlockHash('0xdeadbeef')?.payloadId).toBe(build.payloadId)
  })

  it('returns INVALID from newPayload when the build already equivocated', () => {
    const store = new PayloadStore()
    const build = store.createBuild(basePayloadAttributes(), 0)
    const result = store.getPayload(build.payloadId, 6_000)

    const primaryEnvelope: ExecutionPayloadEnvelope = {
      payloadId: build.payloadId,
      builderId: build.builderId,
      executionPayload: result.executionPayload,
      blobsBundle: result.blobsBundle,
      broadcastAtMs: 6_000,
      variant: 'primary'
    }
    const conflictingEnvelope: ExecutionPayloadEnvelope = {
      ...primaryEnvelope,
      broadcastAtMs: 6_100,
      variant: 'equivocation',
      executionPayload: {
        ...primaryEnvelope.executionPayload,
        blockHash: '0xdeadbeef'
      }
    }

    store.recordEnvelope(build.payloadId, primaryEnvelope)
    store.recordEnvelope(build.payloadId, conflictingEnvelope)

    const validation = store.validateNewPayload(
      {
        executionPayload: primaryEnvelope.executionPayload,
        blobsBundle: primaryEnvelope.blobsBundle
      },
      6_200
    )

    expect(validation.status).toBe('INVALID')
  })
})
