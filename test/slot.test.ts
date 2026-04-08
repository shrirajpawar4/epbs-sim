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

describe('runSlot parameterized committees and adversarial cases', () => {
  it('respects custom committee sizes and ratios', () => {
    const result = runSlot({
      slot: 200,
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

  it('treats a payload hash mismatch as EMPTY by default', () => {
    const scenario = buildScenarios('spec-ish').find((item) => item.scenario === 'hash_mismatch')
    expect(scenario).toBeDefined()

    const result = runSlot(scenario!)
    expect(result.forkChoiceState.payloadHashMatchesCommit).toBe(false)
    expect(result.canonicalHead).toBe('WITHOUT_PAYLOAD')
  })

  it('allows noisy PTC support for an early payload without flipping the model to invalid', () => {
    const scenario = buildScenarios('spec-ish').find((item) => item.scenario === 'early_payload_noisy_ptc')
    expect(scenario).toBeDefined()

    const result = runSlot(scenario!)
    expect(result.payload?.revealedAt).toBeLessThan(SPECISH_TIMING.ptcCutoffMs)
    expect(result.ptcTally.counts.PRESENT).toBeGreaterThan(result.ptcTally.counts.ABSENT)
    expect(result.canonicalHead).toBe('WITH_PAYLOAD')
  })

  it('models delayed network observation separately from actual reveal time', () => {
    const scenario = buildScenarios('spec-ish').find((item) => item.scenario === 'delayed_network_view')
    expect(scenario).toBeDefined()

    const result = runSlot(scenario!)
    expect(result.payload?.revealedAt).toBeLessThan(SPECISH_TIMING.ptcCutoffMs)
    expect(result.forkChoiceState.payloadObservedByPtcAt).toBeGreaterThanOrEqual(SPECISH_TIMING.ptcCutoffMs)
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
      'delayed_network_view'
    ])
    expect(results.map((result) => result.canonicalHead)).toEqual([
      'WITH_PAYLOAD',
      'WITHOUT_PAYLOAD',
      'WITHOUT_PAYLOAD',
      'WITHOUT_PAYLOAD',
      'WITH_PAYLOAD',
      'WITHOUT_PAYLOAD'
    ])
  })

  it('returns sweep points that expose the outcome flip around the cutoff', () => {
    const points = runRevealSweep([null, 8_999, 9_000, 9_001], {
      builderValue: 1n,
      mode: 'spec-ish'
    })

    expect(points).toEqual([
      expect.objectContaining({ revealAt: null, canonicalHead: 'WITHOUT_PAYLOAD' }),
      expect.objectContaining({ revealAt: 8_999, canonicalHead: 'WITH_PAYLOAD' }),
      expect.objectContaining({ revealAt: 9_000, canonicalHead: 'WITHOUT_PAYLOAD' }),
      expect.objectContaining({ revealAt: 9_001, canonicalHead: 'WITHOUT_PAYLOAD' })
    ])
  })
})
