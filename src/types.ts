export type SimulationMode = 'spec-ish' | 'didactic'

export type SlotPhase =
  | 'HEADER_PROPOSED'
  | 'CL_ATTESTATION'
  | 'PAYLOAD_REVEALED'
  | 'ATTESTATION_AGGREGATES'
  | 'PTC_VOTE'
  | 'NEXT_SLOT_FORK_CHOICE'
  | 'COMPLETE'

export type PTCVote = 'PRESENT' | 'ABSENT'
export type CLAttestationVote = 'HEAD' | 'SKIP'
export type PayloadStatus = 'PENDING' | 'FULL' | 'EMPTY'
export type CanonicalHead = 'WITH_PAYLOAD' | 'WITHOUT_PAYLOAD'

export interface BuilderBid {
  builderId: string
  value: bigint
  payloadHash: string
  committed: boolean
}

export interface SignedBeaconBlockHeader {
  slot: number
  proposerId: string
  parentRoot: string
  bid: BuilderBid
  signature: string
}

export interface ExecutionPayload {
  blockHash: string
  transactions: string[]
  revealedAt: number
  observedByPtcAt: number
  hashMatchesCommit: boolean
}

export interface TimelineEvent {
  t: number
  phase: SlotPhase
  event: string
  actor: string
  data?: Record<string, unknown>
}

export interface VoteTally<TVote extends string> {
  total: number
  counts: Record<TVote, number>
}

export interface TimingConfig {
  slotMs: number
  clAttestationMs: number
  aggregateMs: number
  ptcCutoffMs: number
}

export interface ForkChoiceState {
  slotNHeaderAccepted: boolean
  payloadArrived: boolean
  payloadObservedByPtcAt: number | null
  payloadTimelyByObservation: boolean
  payloadHashMatchesCommit: boolean
  payloadStatus: PayloadStatus
  canonicalHead: CanonicalHead
  nextSlotExtends: CanonicalHead
}

export interface SlotResult {
  slot: number
  scenario: string
  mode: SimulationMode
  timing: TimingConfig
  header: SignedBeaconBlockHeader
  payload: ExecutionPayload | null
  payloadStatus: PayloadStatus
  clAttestationVotes: CLAttestationVote[]
  clAttestationTally: VoteTally<CLAttestationVote>
  ptcVotes: PTCVote[]
  ptcTally: VoteTally<PTCVote>
  canonicalHead: CanonicalHead
  forkChoiceState: ForkChoiceState
  nextSlotDecision: {
    slot: number
    extends: CanonicalHead
    reason: string
  }
  timeline: TimelineEvent[]
}

export interface ScenarioDefinition {
  slot: number
  scenario: string
  builderRevealsAt: number | null
  builderValue: bigint
  mode?: SimulationMode
  ptcPresentRatio?: number
  clHeadVoteRatio?: number
  ptcSize?: number
  clAttesterSize?: number
  payloadObservedByPtcAt?: number | null
  payloadHashMatchesCommit?: boolean
}

export interface SweepPoint {
  revealAt: number | null
  observedByPtcAt: number | null
  payloadStatus: PayloadStatus
  ptcPresent: number
  ptcAbsent: number
  canonicalHead: CanonicalHead
}
