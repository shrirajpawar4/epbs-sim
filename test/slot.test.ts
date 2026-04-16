import { describe, expect, it } from 'vitest'

import { buildScenarios, runAllScenarios } from '../src/scenarios.ts'
import { DIDACTIC_TIMING, runBuilderFetchSweep, runSlot, SPECISH_TIMING } from '../src/slot.ts'

describe('runSlot engine-backed scenarios', () => {
  it('keeps the happy path on WITH_PAYLOAD before the cutoff', async () => {
    const result = await runSlot({
      slot: 100,
      scenario: 'happy-path-boundary',
      builderFetchAtMs: 8_999,
      builderAction: 'reveal',
      builderValue: 1n
    })

    expect(result.newPayloadStatus).toBe('VALID')
    expect(result.payloadDisposition).toBe('TIMELY_VALID')
    expect(result.canonicalHead).toBe('WITH_PAYLOAD')
  })

  it('flips to WITHOUT_PAYLOAD when builder fetches at or after the cutoff', async () => {
    for (const builderFetchAtMs of [SPECISH_TIMING.ptcCutoffMs, SPECISH_TIMING.ptcCutoffMs + 1]) {
      const result = await runSlot({
        slot: 200 + builderFetchAtMs,
        scenario: `late-${builderFetchAtMs}`,
        builderFetchAtMs,
        builderAction: 'reveal',
        builderValue: 1n
      })

      expect(result.newPayloadStatus).toBe('VALID')
      expect(result.payloadDisposition).toBe('LATE_BY_OBSERVATION')
      expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
    }
  })

  it('marks withhold when the builder fetches but never broadcasts', async () => {
    const result = await runSlot({
      slot: 300,
      scenario: 'withhold',
      builderFetchAtMs: 6_000,
      builderAction: 'withhold',
      builderValue: 1n
    })

    expect(result.payload).toBeNull()
    expect(result.newPayloadAttempted).toBe(false)
    expect(result.buildState).toBe('WITHHELD')
    expect(result.payloadDisposition).toBe('WITHHELD')
    expect(result.ptcTally.counts.ABSENT).toBe(result.ptcTally.total)
  })

  it('marks equivocation on the second envelope and skips newPayload entirely', async () => {
    const result = await runSlot({
      slot: 400,
      scenario: 'equivocation',
      builderFetchAtMs: 6_200,
      builderAction: 'equivocate',
      builderValue: 1n,
      validatorCallsNewPayload: false
    })

    expect(result.payloads).toHaveLength(2)
    expect(result.payloads[0]?.executionPayload.blockHash).not.toBe(result.payloads[1]?.executionPayload.blockHash)
    expect(result.newPayloadAttempted).toBe(false)
    expect(result.newPayloadStatus).toBeNull()
    expect(result.buildState).toBe('EQUIVOCATED')
    expect(result.payloadDisposition).toBe('EQUIVOCATED')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })

  it('supports didactic timing mode separately', async () => {
    const result = await runSlot({
      slot: 500,
      scenario: 'didactic-late',
      builderFetchAtMs: DIDACTIC_TIMING.ptcCutoffMs,
      builderAction: 'reveal',
      builderValue: 1n,
      mode: 'didactic'
    })

    expect(result.mode).toBe('didactic')
    expect(result.payloadDisposition).toBe('LATE_BY_OBSERVATION')
  })
})

describe('scenario presets and sweep semantics', () => {
  it('runs the documented scenarios deterministically', async () => {
    const results = await runAllScenarios()

    expect(results.map((result) => result.scenario)).toEqual([
      'happy-path',
      'withhold',
      'late-reveal',
      'equivocation'
    ])
    expect(results.map((result) => result.payloadDisposition)).toEqual([
      'TIMELY_VALID',
      'WITHHELD',
      'LATE_BY_OBSERVATION',
      'EQUIVOCATED'
    ])
  })

  it('uses builder fetch time as the sweep control variable', async () => {
    const points = await runBuilderFetchSweep([null, 8_999, 9_000, 9_001], {
      builderValue: 1n,
      builderAction: 'reveal',
      mode: 'spec-ish'
    })

    expect(points).toEqual([
      expect.objectContaining({ builderFetchAtMs: null, newPayloadStatus: null, payloadDisposition: 'WITHHELD', canonicalHead: 'WITHOUT_PAYLOAD' }),
      expect.objectContaining({ builderFetchAtMs: 8_999, newPayloadStatus: 'VALID', payloadDisposition: 'TIMELY_VALID', canonicalHead: 'WITH_PAYLOAD' }),
      expect.objectContaining({ builderFetchAtMs: 9_000, newPayloadStatus: 'VALID', payloadDisposition: 'LATE_BY_OBSERVATION', canonicalHead: 'WITHOUT_PAYLOAD' }),
      expect.objectContaining({ builderFetchAtMs: 9_001, newPayloadStatus: 'VALID', payloadDisposition: 'LATE_BY_OBSERVATION', canonicalHead: 'WITHOUT_PAYLOAD' })
    ])
  })

  it('keeps scenario modules aligned with the expected names', () => {
    expect(buildScenarios('spec-ish').map((scenario) => scenario.scenario)).toEqual([
      'happy-path',
      'withhold',
      'late-reveal',
      'equivocation'
    ])
  })
})
