export function createSignedHeader(slot, bid) {
    return {
        slot,
        proposerId: 'proposer-0',
        parentRoot: '0xparent',
        bid,
        signature: '0xsig'
    };
}
