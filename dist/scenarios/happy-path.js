export function buildHappyPathScenario(mode) {
    return {
        slot: 1,
        scenario: 'happy-path',
        builderValue: 1000000000000000000n,
        builderFetchAtMs: mode === 'didactic' ? 3_000 : 6_000,
        builderAction: 'reveal',
        mode
    };
}
