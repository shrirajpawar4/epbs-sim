import { runSlot } from "./slot.js";
export function buildScenarios(mode) {
    return [
        {
            slot: 1,
            scenario: 'happy_path',
            builderRevealsAt: mode === 'didactic' ? 3_000 : 6_000,
            builderValue: 1000000000000000000n,
            mode
        },
        {
            slot: 2,
            scenario: 'builder_withholds',
            builderRevealsAt: null,
            builderValue: 1000000000000000000n,
            mode
        },
        {
            slot: 3,
            scenario: 'late_payload',
            builderRevealsAt: mode === 'didactic' ? 4_500 : 9_500,
            payloadObservedByPtcAt: mode === 'didactic' ? 4_500 : 9_500,
            builderValue: 1000000000000000000n,
            ptcPresentRatio: 0.3,
            mode
        },
        {
            slot: 4,
            scenario: 'hash_mismatch',
            builderRevealsAt: mode === 'didactic' ? 3_500 : 6_500,
            payloadHashMatchesCommit: false,
            builderValue: 1000000000000000000n,
            mode
        },
        {
            slot: 5,
            scenario: 'early_payload_noisy_ptc',
            builderRevealsAt: mode === 'didactic' ? 3_200 : 6_200,
            payloadObservedByPtcAt: mode === 'didactic' ? 3_200 : 6_200,
            builderValue: 1000000000000000000n,
            ptcPresentRatio: 0.62,
            mode
        },
        {
            slot: 6,
            scenario: 'delayed_network_view',
            builderRevealsAt: mode === 'didactic' ? 3_900 : 8_700,
            payloadObservedByPtcAt: mode === 'didactic' ? 4_100 : 9_100,
            builderValue: 1000000000000000000n,
            mode
        },
        {
            slot: 7,
            scenario: 'execution_invalid',
            builderRevealsAt: mode === 'didactic' ? 3_100 : 6_100,
            payloadObservedByPtcAt: mode === 'didactic' ? 3_100 : 6_100,
            executionValid: false,
            builderValue: 1000000000000000000n,
            mode
        },
        {
            slot: 8,
            scenario: 'gossip_rejected',
            builderRevealsAt: mode === 'didactic' ? 3_300 : 6_300,
            payloadObservedByPtcAt: mode === 'didactic' ? 3_300 : 6_300,
            gossipAccepted: false,
            builderValue: 1000000000000000000n,
            mode
        },
        {
            slot: 9,
            scenario: 'ptc_rejected',
            builderRevealsAt: mode === 'didactic' ? 3_100 : 6_100,
            payloadObservedByPtcAt: mode === 'didactic' ? 3_100 : 6_100,
            ptcPresentRatio: 0.45,
            builderValue: 1000000000000000000n,
            mode
        }
    ];
}
export function runAllScenarios(mode = 'spec-ish') {
    return buildScenarios(mode).map(runSlot);
}
