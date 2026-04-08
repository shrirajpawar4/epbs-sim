import type { PTCVote, VoteTally } from '../types.ts'

export const DEFAULT_PTC_SIZE = 512

export function buildPtcVotes(committeeSize: number, presentRatio: number): PTCVote[] {
  const presentCount = Math.max(0, Math.min(committeeSize, Math.floor(committeeSize * presentRatio)))
  return Array.from({ length: committeeSize }, (_, index) => (index < presentCount ? 'PRESENT' : 'ABSENT'))
}

export function tallyPtcVotes(votes: PTCVote[]): VoteTally<PTCVote> {
  const counts: Record<PTCVote, number> = { PRESENT: 0, ABSENT: 0 }
  for (const vote of votes) counts[vote] += 1

  return {
    total: votes.length,
    counts
  }
}
