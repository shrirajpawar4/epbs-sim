export function createBuilderBid(value) {
    return {
        builderId: 'builder-0',
        value,
        payloadHash: '0xpayloadhash',
        committed: true
    };
}
export function revealPayload(revealedAt, observedByPtcAt, hashMatchesCommit) {
    return {
        blockHash: hashMatchesCommit ? '0xpayloadhash' : '0xdifferenthash',
        transactions: ['0xtx1', '0xtx2'],
        revealedAt,
        observedByPtcAt,
        hashMatchesCommit
    };
}
