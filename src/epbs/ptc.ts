import type {
  BuildState,
  CanonicalHead,
  EnginePayloadStatus,
  ExecutionPayloadEnvelope,
  PayloadDisposition,
  PayloadStatus,
  PTCVote,
  TimingConfig,
  VoteTally
} from '../types.ts'

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

export function payloadStatusFromPtcOutcome(ptcPresentMajority: boolean): PayloadStatus {
  return ptcPresentMajority ? 'FULL' : 'EMPTY'
}

export function canonicalHeadFromStatus(payloadStatus: PayloadStatus): CanonicalHead {
  return payloadStatus === 'FULL' ? 'WITH_PAYLOAD' : 'WITHOUT_PAYLOAD'
}

export function defaultPtcPresentRatio(
  payload: ExecutionPayloadEnvelope | null,
  buildState: BuildState,
  observedByPtcAt: number | null,
  newPayloadStatus: EnginePayloadStatus | null,
  timing: TimingConfig
): number {
  if (buildState === 'EQUIVOCATED') return 0
  if (payload === null) return 0
  if (newPayloadStatus === 'INVALID') return 0
  if (observedByPtcAt === null) return 0
  return observedByPtcAt < timing.ptcCutoffMs ? 1 : 0
}

export function classifyPayloadDisposition(
  payload: ExecutionPayloadEnvelope | null,
  buildState: BuildState,
  observedByPtcAt: number | null,
  newPayloadStatus: EnginePayloadStatus | null,
  timing: TimingConfig,
  ptcPresentMajority: boolean
): PayloadDisposition {
  if (buildState === 'EQUIVOCATED') return 'EQUIVOCATED'
  if (payload === null) return 'WITHHELD'
  if (newPayloadStatus === 'INVALID') return 'EXECUTION_INVALID'
  if (observedByPtcAt === null || observedByPtcAt >= timing.ptcCutoffMs) return 'LATE_BY_OBSERVATION'
  if (!ptcPresentMajority) return 'PTC_REJECTED'
  return 'TIMELY_VALID'
}
