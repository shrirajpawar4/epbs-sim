import { buildClAttestationVotes, DEFAULT_CL_ATTESTER_SIZE, tallyClAttestationVotes } from "./entities/attesters.js";
import { createBuilderBid, revealPayload } from "./entities/builder.js";
import { buildPtcVotes, DEFAULT_PTC_SIZE, tallyPtcVotes } from "./entities/ptc.js";
import { createSignedHeader } from "./entities/proposer.js";
export const SLOT_MS = 12_000;
export const SPECISH_TIMING = {
    slotMs: SLOT_MS,
    clAttestationMs: 3_000,
    aggregateMs: 6_000,
    ptcCutoffMs: 9_000
};
export const DIDACTIC_TIMING = {
    slotMs: SLOT_MS,
    clAttestationMs: 6_000,
    aggregateMs: 8_000,
    ptcCutoffMs: 4_000
};
export function getTiming(mode) {
    return mode === 'didactic' ? DIDACTIC_TIMING : SPECISH_TIMING;
}
function payloadStatusFromPtcOutcome(ptcPresentMajority) {
    return ptcPresentMajority ? 'FULL' : 'EMPTY';
}
function canonicalHeadFromStatus(payloadStatus) {
    return payloadStatus === 'FULL' ? 'WITH_PAYLOAD' : 'WITHOUT_PAYLOAD';
}
function defaultPtcPresentRatio(payload, timing) {
    if (payload === null)
        return 0;
    if (!payload.hashMatchesCommit)
        return 0;
    return payload.observedByPtcAt < timing.ptcCutoffMs ? 1 : 0;
}
function defaultClHeadVoteRatio() {
    return 1;
}
function resolvePayload(config, timing) {
    if (config.builderRevealsAt === null)
        return null;
    const observedByPtcAt = config.payloadObservedByPtcAt === null
        ? timing.ptcCutoffMs + 1
        : (config.payloadObservedByPtcAt ?? config.builderRevealsAt);
    return revealPayload(config.builderRevealsAt, observedByPtcAt, config.payloadHashMatchesCommit ?? true);
}
function buildForkChoiceState(payload, timing, payloadStatus, canonicalHead) {
    return {
        slotNHeaderAccepted: true,
        payloadArrived: payload !== null,
        payloadObservedByPtcAt: payload?.observedByPtcAt ?? null,
        payloadTimelyByObservation: payload !== null && payload.observedByPtcAt < timing.ptcCutoffMs,
        payloadHashMatchesCommit: payload?.hashMatchesCommit ?? false,
        payloadStatus,
        canonicalHead,
        nextSlotExtends: canonicalHead
    };
}
export function runSlot(config) {
    const mode = config.mode ?? 'spec-ish';
    const timing = getTiming(mode);
    const ptcSize = config.ptcSize ?? DEFAULT_PTC_SIZE;
    const clAttesterSize = config.clAttesterSize ?? DEFAULT_CL_ATTESTER_SIZE;
    const timeline = [];
    const log = (t, actor, phase, event, data) => {
        timeline.push({ t, actor, phase, event, data });
    };
    const bid = createBuilderBid(config.builderValue);
    const header = createSignedHeader(config.slot, bid);
    log(0, 'proposer', 'HEADER_PROPOSED', 'Signed beacon block header broadcast', {
        bidValueWei: header.bid.value.toString(),
        payloadHash: header.bid.payloadHash,
        mode
    });
    const clHeadVoteRatio = config.clHeadVoteRatio ?? defaultClHeadVoteRatio();
    const clAttestationVotes = buildClAttestationVotes(clAttesterSize, clHeadVoteRatio);
    const clAttestationTally = tallyClAttestationVotes(clAttestationVotes);
    log(timing.clAttestationMs, 'attesters', 'CL_ATTESTATION', 'CL attesters vote on the beacon header path', {
        head: clAttestationTally.counts.HEAD,
        skip: clAttestationTally.counts.SKIP,
        committeeSize: clAttesterSize
    });
    const payload = resolvePayload(config, timing);
    if (payload !== null) {
        log(payload.revealedAt, 'builder', 'PAYLOAD_REVEALED', 'Builder reveals full execution payload', {
            blockHash: payload.blockHash,
            observedByPtcAt: payload.observedByPtcAt,
            hashMatchesCommit: payload.hashMatchesCommit
        });
    }
    else {
        log(timing.aggregateMs, 'builder', 'PAYLOAD_REVEALED', 'Builder withholds payload beyond reveal window');
    }
    log(timing.aggregateMs, 'network', 'ATTESTATION_AGGREGATES', 'CL aggregates for slot N are broadcast', {
        slot: config.slot
    });
    const ptcPresentRatio = config.ptcPresentRatio ?? defaultPtcPresentRatio(payload, timing);
    const ptcVotes = buildPtcVotes(ptcSize, ptcPresentRatio);
    const ptcTally = tallyPtcVotes(ptcVotes);
    const payloadStatus = payloadStatusFromPtcOutcome(ptcTally.counts.PRESENT > ptcSize / 2);
    log(timing.ptcCutoffMs, 'ptc', 'PTC_VOTE', 'PTC votes on payload timeliness', {
        present: ptcTally.counts.PRESENT,
        absent: ptcTally.counts.ABSENT,
        committeeSize: ptcSize,
        observedPayloadAt: payload?.observedByPtcAt ?? null,
        payloadStatus
    });
    const canonicalHead = canonicalHeadFromStatus(payloadStatus);
    const nextSlotDecision = {
        slot: config.slot + 1,
        extends: canonicalHead,
        reason: canonicalHead === 'WITH_PAYLOAD'
            ? 'PTC majority marked payload timely, so slot N+1 extends FULL'
            : 'PTC majority marked payload absent/late, so slot N+1 extends EMPTY'
    };
    const forkChoiceState = buildForkChoiceState(payload, timing, payloadStatus, canonicalHead);
    log(timing.slotMs, 'fork-choice', 'NEXT_SLOT_FORK_CHOICE', 'Slot N+1 proposer extends the canonical branch', nextSlotDecision);
    log(timing.slotMs, 'slot', 'COMPLETE', 'Slot simulation complete', {
        canonicalHead
    });
    timeline.sort((left, right) => left.t - right.t);
    return {
        slot: config.slot,
        scenario: config.scenario,
        mode,
        timing,
        header,
        payload,
        payloadStatus,
        clAttestationVotes,
        clAttestationTally,
        ptcVotes,
        ptcTally,
        canonicalHead,
        forkChoiceState,
        nextSlotDecision,
        timeline
    };
}
export function runRevealSweep(revealTimes, baseConfig) {
    return revealTimes.map((revealAt, index) => {
        const result = runSlot({
            slot: 1_000 + index,
            scenario: revealAt === null ? 'sweep_withheld' : `sweep_${revealAt}`,
            builderRevealsAt: revealAt,
            ...baseConfig
        });
        return {
            revealAt,
            observedByPtcAt: result.payload?.observedByPtcAt ?? null,
            payloadStatus: result.payloadStatus,
            ptcPresent: result.ptcTally.counts.PRESENT,
            ptcAbsent: result.ptcTally.counts.ABSENT,
            canonicalHead: result.canonicalHead
        };
    });
}
