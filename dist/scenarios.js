import { buildEquivocationScenario } from "./scenarios/equivocation.js";
import { buildHappyPathScenario } from "./scenarios/happy-path.js";
import { buildLateRevealScenario } from "./scenarios/late-reveal.js";
import { buildWithholdScenario } from "./scenarios/withhold.js";
import { runSlot } from "./slot.js";
export function buildScenarios(mode) {
    return [
        buildHappyPathScenario(mode),
        buildWithholdScenario(mode),
        buildLateRevealScenario(mode),
        buildEquivocationScenario(mode)
    ];
}
export async function runAllScenarios(mode = 'spec-ish', options = {}) {
    const results = [];
    for (const scenario of buildScenarios(mode))
        results.push(await runSlot(scenario, options));
    return results;
}
