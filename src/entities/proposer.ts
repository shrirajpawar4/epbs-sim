import type { BuilderBid, SignedBeaconBlockHeader } from '../types.ts'

export function createSignedHeader(slot: number, bid: BuilderBid): SignedBeaconBlockHeader {
  return {
    slot,
    proposerId: 'proposer-0',
    parentRoot: '0xparent',
    bid,
    signature: '0xsig'
  }
}
