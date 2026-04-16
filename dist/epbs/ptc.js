export const DEFAULT_PTC_SIZE = 512;
export function buildPtcVotes(committeeSize, presentRatio) {
    const presentCount = Math.max(0, Math.min(committeeSize, Math.floor(committeeSize * presentRatio)));
    return Array.from({ length: committeeSize }, (_, index) => (index < presentCount ? 'PRESENT' : 'ABSENT'));
}
export function tallyPtcVotes(votes) {
    const counts = { PRESENT: 0, ABSENT: 0 };
    for (const vote of votes)
        counts[vote] += 1;
    return {
        total: votes.length,
        counts
    };
}
export function payloadStatusFromPtcOutcome(ptcPresentMajority) {
    return ptcPresentMajority ? 'FULL' : 'EMPTY';
}
export function canonicalHeadFromStatus(payloadStatus) {
    return payloadStatus === 'FULL' ? 'WITH_PAYLOAD' : 'WITHOUT_PAYLOAD';
}
export function defaultPtcPresentRatio(payload, buildState, observedByPtcAt, newPayloadStatus, timing) {
    if (buildState === 'EQUIVOCATED')
        return 0;
    if (payload === null)
        return 0;
    if (newPayloadStatus === 'INVALID')
        return 0;
    if (observedByPtcAt === null)
        return 0;
    return observedByPtcAt < timing.ptcCutoffMs ? 1 : 0;
}
export function classifyPayloadDisposition(payload, buildState, observedByPtcAt, newPayloadStatus, timing, ptcPresentMajority) {
    if (buildState === 'EQUIVOCATED')
        return 'EQUIVOCATED';
    if (payload === null)
        return 'WITHHELD';
    if (newPayloadStatus === 'INVALID')
        return 'EXECUTION_INVALID';
    if (observedByPtcAt === null || observedByPtcAt >= timing.ptcCutoffMs)
        return 'LATE_BY_OBSERVATION';
    if (!ptcPresentMajority)
        return 'PTC_REJECTED';
    return 'TIMELY_VALID';
}
