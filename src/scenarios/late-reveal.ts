import type { ScenarioDefinition, SimulationMode } from '../types.ts'

export function buildLateRevealScenario(mode: SimulationMode): ScenarioDefinition {
  return {
    slot: 3,
    scenario: 'late-reveal',
    builderValue: 1_000_000_000_000_000_000n,
    builderFetchAtMs: mode === 'didactic' ? 4_500 : 9_500,
    builderAction: 'reveal',
    mode
  }
}
