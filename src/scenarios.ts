import { buildEquivocationScenario } from './scenarios/equivocation.ts'
import { buildHappyPathScenario } from './scenarios/happy-path.ts'
import { buildLateRevealScenario } from './scenarios/late-reveal.ts'
import { buildWithholdScenario } from './scenarios/withhold.ts'
import { runSlot } from './slot.ts'
import type { ScenarioDefinition, SimulationMode, SlotResult } from './types.ts'
import type { RpcLogger } from './engine/mock-engine-api.ts'

interface RunScenarioOptions {
  rpcLogger?: RpcLogger
}

export function buildScenarios(mode: SimulationMode): ScenarioDefinition[] {
  return [
    buildHappyPathScenario(mode),
    buildWithholdScenario(mode),
    buildLateRevealScenario(mode),
    buildEquivocationScenario(mode)
  ]
}

export async function runAllScenarios(
  mode: SimulationMode = 'spec-ish',
  options: RunScenarioOptions = {}
): Promise<SlotResult[]> {
  const results: SlotResult[] = []
  for (const scenario of buildScenarios(mode)) results.push(await runSlot(scenario, options))
  return results
}
