export const DEFAULT_CL_ATTESTER_SIZE = 16_384;
export function buildClAttestationVotes(committeeSize, headVoteRatio) {
    const headCount = Math.max(0, Math.min(committeeSize, Math.floor(committeeSize * headVoteRatio)));
    return Array.from({ length: committeeSize }, (_, index) => (index < headCount ? 'HEAD' : 'SKIP'));
}
export function tallyClAttestationVotes(votes) {
    const counts = { HEAD: 0, SKIP: 0 };
    for (const vote of votes)
        counts[vote] += 1;
    return {
        total: votes.length,
        counts
    };
}
