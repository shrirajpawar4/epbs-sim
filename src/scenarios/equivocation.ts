import type { ScenarioDefinition, SimulationMode } from '../types.ts'

export function buildEquivocationScenario(mode: SimulationMode): ScenarioDefinition {
  return {
    slot: 4,
    scenario: 'equivocation',
    builderValue: 1_000_000_000_000_000_000n,
    builderFetchAtMs: mode === 'didactic' ? 3_200 : 6_200,
    builderAction: 'equivocate',
    equivocationGapMs: 200,
    validatorCallsNewPayload: false,
    mode
  }
}
