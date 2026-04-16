import type { ScenarioDefinition, SimulationMode } from '../types.ts'

export function buildWithholdScenario(mode: SimulationMode): ScenarioDefinition {
  return {
    slot: 2,
    scenario: 'withhold',
    builderValue: 1_000_000_000_000_000_000n,
    builderFetchAtMs: mode === 'didactic' ? 3_000 : 6_000,
    builderAction: 'withhold',
    mode
  }
}
