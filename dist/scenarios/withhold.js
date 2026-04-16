export function buildWithholdScenario(mode) {
    return {
        slot: 2,
        scenario: 'withhold',
        builderValue: 1000000000000000000n,
        builderFetchAtMs: mode === 'didactic' ? 3_000 : 6_000,
        builderAction: 'withhold',
        mode
    };
}
