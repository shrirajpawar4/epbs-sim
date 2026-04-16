import type { ScenarioDefinition, SimulationMode } from '../types.ts'

export function buildHappyPathScenario(mode: SimulationMode): ScenarioDefinition {
  return {
    slot: 1,
    scenario: 'happy-path',
    builderValue: 1_000_000_000_000_000_000n,
    builderFetchAtMs: mode === 'didactic' ? 3_000 : 6_000,
    builderAction: 'reveal',
    mode
  }
}
