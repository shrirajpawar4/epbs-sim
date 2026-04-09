import { describe, expect, it } from 'vitest'

import { buildScenarios, runAllScenarios } from '../src/scenarios.ts'
import { DIDACTIC_TIMING, SPECISH_TIMING, runRevealSweep, runSlot } from '../src/slot.ts'

describe('runSlot boundaries', () => {
  const times = [5_999, 6_000, 8_999, 9_000, 9_001]

  it.each(times)('classifies spec-ish reveal time %dms deterministically', (revealedAt) => {
    const result = runSlot({
      slot: 10 + revealedAt,
      scenario: `boundary_${revealedAt}`,
      builderRevealsAt: revealedAt,
      builderValue: 1n
    })

    const expected = revealedAt < SPECISH_TIMING.ptcCutoffMs ? 'WITH_PAYLOAD' : 'WITHOUT_PAYLOAD'
    expect(result.canonicalHead).toBe(expected)
  })

  it('supports didactic timing mode separately', () => {
    const result = runSlot({
      slot: 100,
      scenario: 'didactic_boundary',
      builderRevealsAt: DIDACTIC_TIMING.ptcCutoffMs,
      builderValue: 1n,
      mode: 'didactic'
    })

    expect(result.mode).toBe('didactic')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })
})

describe('payload dispositions', () => {
  it('classifies withheld payloads explicitly', () => {
    const result = runSlot({
      slot: 200,
      scenario: 'withheld',
      builderRevealsAt: null,
      builderValue: 1n
    })

    expect(result.payloadDisposition).toBe('WITHHELD')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })

  it('classifies late observation explicitly', () => {
    const result = runSlot({
      slot: 201,
      scenario: 'late_observed',
      builderRevealsAt: 8_700,
      payloadObservedByPtcAt: 9_100,
      builderValue: 1n
    })

    expect(result.payloadDisposition).toBe('LATE_BY_OBSERVATION')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })

  it('classifies commitment mismatch explicitly', () => {
    const result = runSlot({
      slot: 202,
      scenario: 'bad_commitment',
      builderRevealsAt: 6_100,
      payloadHashMatchesCommit: false,
      builderValue: 1n
    })

    expect(result.payloadDisposition).toBe('COMMITMENT_MISMATCH')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })

  it('classifies execution invalid payloads explicitly', () => {
    const result = runSlot({
      slot: 203,
      scenario: 'execution_invalid',
      builderRevealsAt: 6_100,
      executionValid: false,
      builderValue: 1n
    })

    expect(result.payloadDisposition).toBe('EXECUTION_INVALID')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })

  it('classifies gossip rejection explicitly', () => {
    const result = runSlot({
      slot: 204,
      scenario: 'gossip_rejected',
      builderRevealsAt: 6_100,
      gossipAccepted: false,
      builderValue: 1n
    })

    expect(result.payloadDisposition).toBe('GOSSIP_REJECTED')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })

  it('classifies PTC rejection explicitly when the payload is otherwise timely and valid', () => {
    const result = runSlot({
      slot: 205,
      scenario: 'ptc_rejected',
      builderRevealsAt: 6_100,
      payloadObservedByPtcAt: 6_100,
      ptcSize: 100,
      ptcPresentRatio: 0.45,
      builderValue: 1n
    })

    expect(result.payloadDisposition).toBe('PTC_REJECTED')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })

  it('classifies timely valid payloads explicitly', () => {
    const result = runSlot({
      slot: 206,
      scenario: 'timely_valid',
      builderRevealsAt: 6_100,
      payloadObservedByPtcAt: 6_100,
      builderValue: 1n
    })

    expect(result.payloadDisposition).toBe('TIMELY_VALID')
    expect(result.canonicalHead).toBe('WITH_PAYLOAD')
  })
})

describe('runSlot parameterized committees and adversarial cases', () => {
  it('respects custom committee sizes and ratios', () => {
    const result = runSlot({
      slot: 300,
      scenario: 'custom_committees',
      builderRevealsAt: 8_500,
      builderValue: 1n,
      ptcSize: 10,
      clAttesterSize: 20,
      ptcPresentRatio: 0.6,
      clHeadVoteRatio: 0.75
    })

    expect(result.ptcVotes).toHaveLength(10)
    expect(result.ptcTally.counts.PRESENT).toBe(6)
    expect(result.clAttestationVotes).toHaveLength(20)
    expect(result.clAttestationTally.counts.HEAD).toBe(15)
    expect(result.canonicalHead).toBe('WITH_PAYLOAD')
  })

  it('models delayed network observation separately from actual reveal time', () => {
    const scenario = buildScenarios('spec-ish').find((item) => item.scenario === 'delayed_network_view')
    expect(scenario).toBeDefined()

    const result = runSlot(scenario!)
    expect(result.payload?.revealedAt).toBeLessThan(SPECISH_TIMING.ptcCutoffMs)
    expect(result.forkChoiceState.payloadObservedByPtcAt).toBeGreaterThanOrEqual(SPECISH_TIMING.ptcCutoffMs)
    expect(result.payloadDisposition).toBe('LATE_BY_OBSERVATION')
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })
})

describe('property-style invariants', () => {
  it('never promotes a reveal at or after the cutoff to WITH_PAYLOAD under default voting', () => {
    for (let revealedAt = SPECISH_TIMING.ptcCutoffMs; revealedAt <= SPECISH_TIMING.slotMs; revealedAt += 100) {
      const result = runSlot({
        slot: 400 + revealedAt,
        scenario: `late_${revealedAt}`,
        builderRevealsAt: revealedAt,
        builderValue: 1n
      })

      expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
      expect(result.payloadDisposition).toBe('LATE_BY_OBSERVATION')
    }
  })

  it('always extends WITHOUT_PAYLOAD when the PTC majority is ABSENT', () => {
    for (const ptcPresentRatio of [0, 0.1, 0.49, 0.5]) {
      const result = runSlot({
        slot: 500 + Math.floor(ptcPresentRatio * 100),
        scenario: `ptc_absent_${ptcPresentRatio}`,
        builderRevealsAt: 6_000,
        builderValue: 1n,
        ptcSize: 100,
        ptcPresentRatio
      })

      expect(result.ptcTally.counts.PRESENT).toBeLessThanOrEqual(50)
      expect(result.nextSlotDecision.extends).toBe('WITHOUT_PAYLOAD')
    }
  })
})

describe('scenario presets and sweeps', () => {
  it('runs the documented scenarios deterministically', () => {
    const results = runAllScenarios()

    expect(results.map((result) => result.scenario)).toEqual([
      'happy_path',
      'builder_withholds',
      'late_payload',
      'hash_mismatch',
      'early_payload_noisy_ptc',
      'delayed_network_view',
      'execution_invalid',
      'gossip_rejected',
      'ptc_rejected'
    ])
    expect(results.map((result) => result.payloadDisposition)).toEqual([
      'TIMELY_VALID',
      'WITHHELD',
      'LATE_BY_OBSERVATION',
      'COMMITMENT_MISMATCH',
      'TIMELY_VALID',
      'LATE_BY_OBSERVATION',
      'EXECUTION_INVALID',
      'GOSSIP_REJECTED',
      'PTC_REJECTED'
    ])
  })

  it('returns sweep points that expose the outcome flip around the cutoff', () => {
    const points = runRevealSweep([null, 8_999, 9_000, 9_001], {
      builderValue: 1n,
      mode: 'spec-ish'
    })

    expect(points).toEqual([
      expect.objectContaining({ revealAt: null, payloadDisposition: 'WITHHELD', canonicalHead: 'WITHOUT_PAYLOAD' }),
      expect.objectContaining({ revealAt: 8_999, payloadDisposition: 'TIMELY_VALID', canonicalHead: 'WITH_PAYLOAD' }),
      expect.objectContaining({ revealAt: 9_000, payloadDisposition: 'LATE_BY_OBSERVATION', canonicalHead: 'WITHOUT_PAYLOAD' }),
      expect.objectContaining({ revealAt: 9_001, payloadDisposition: 'LATE_BY_OBSERVATION', canonicalHead: 'WITHOUT_PAYLOAD' })
    ])
  })
})
