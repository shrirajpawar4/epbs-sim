export function buildLateRevealScenario(mode) {
    return {
        slot: 3,
        scenario: 'late-reveal',
        builderValue: 1000000000000000000n,
        builderFetchAtMs: mode === 'didactic' ? 4_500 : 9_500,
        builderAction: 'reveal',
        mode
    };
}
