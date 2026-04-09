import type { BuilderBid, ExecutionPayload } from '../types.ts'

export function createBuilderBid(value: bigint): BuilderBid {
  return {
    builderId: 'builder-0',
    value,
    payloadHash: '0xpayloadhash',
    committed: true
  }
}

export function revealPayload(
  revealedAt: number,
  observedByPtcAt: number,
  hashMatchesCommit: boolean,
  executionValid: boolean,
  gossipAccepted: boolean
): ExecutionPayload {
  return {
    blockHash: hashMatchesCommit ? '0xpayloadhash' : '0xdifferenthash',
    transactions: ['0xtx1', '0xtx2'],
    revealedAt,
    observedByPtcAt,
    hashMatchesCommit,
    executionValid,
    gossipAccepted
  }
}
