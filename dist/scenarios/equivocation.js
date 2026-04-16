export function buildEquivocationScenario(mode) {
    return {
        slot: 4,
        scenario: 'equivocation',
        builderValue: 1000000000000000000n,
        builderFetchAtMs: mode === 'didactic' ? 3_200 : 6_200,
        builderAction: 'equivocate',
        equivocationGapMs: 200,
        validatorCallsNewPayload: false,
        mode
    };
}
