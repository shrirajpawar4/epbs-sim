export type SimulationMode = 'spec-ish' | 'didactic'

export type SlotPhase =
  | 'HEADER_PROPOSED'
  | 'ENGINE_FORKCHOICE_UPDATED'
  | 'ENGINE_GET_PAYLOAD'
  | 'CL_ATTESTATION'
  | 'PAYLOAD_REVEALED'
  | 'PAYLOAD_VALIDATION'
  | 'ATTESTATION_AGGREGATES'
  | 'PTC_VOTE'
  | 'NEXT_SLOT_FORK_CHOICE'
  | 'COMPLETE'

export type PTCVote = 'PRESENT' | 'ABSENT'
export type CLAttestationVote = 'HEAD' | 'SKIP'
export type PayloadStatus = 'FULL' | 'EMPTY'
export type CanonicalHead = 'WITH_PAYLOAD' | 'WITHOUT_PAYLOAD'
export type EnginePayloadStatus = 'VALID' | 'INVALID' | 'SYNCING'
export type BuildState =
  | 'BUILDING'
  | 'FETCHED'
  | 'REVEALED'
  | 'VALIDATED'
  | 'WITHHELD'
  | 'LATE'
  | 'EQUIVOCATED'

export type PayloadDisposition =
  | 'TIMELY_VALID'
  | 'WITHHELD'
  | 'LATE_BY_OBSERVATION'
  | 'EXECUTION_INVALID'
  | 'PTC_REJECTED'
  | 'EQUIVOCATED'

export type BuilderAction = 'reveal' | 'withhold' | 'equivocate'

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
  payloadId: string
}

export interface ExecutionPayloadV3 {
  blockHash: string
  parentHash: string
  feeRecipient: string
  stateRoot: string
  receiptsRoot: string
  blockNumber: number
  timestamp: number
  transactions: string[]
}

export interface BlobsBundle {
  commitments: string[]
  proofs: string[]
  blobs: string[]
}

export interface ExecutionPayloadEnvelope {
  payloadId: string
  builderId: string
  executionPayload: ExecutionPayloadV3
  blobsBundle: BlobsBundle
  broadcastAtMs: number
  variant: 'primary' | 'equivocation'
}

export interface EnvelopeObservation {
  payloadId: string
  blockHash: string
  broadcastAtMs: number
  variant: ExecutionPayloadEnvelope['variant']
}

export interface ForkchoiceStateV3 {
  headBlockHash: string
  safeBlockHash: string
  finalizedBlockHash: string
}

export interface PayloadAttributesV3 {
  timestamp: number
  prevRandao: string
  suggestedFeeRecipient: string
  parentBeaconBlockRoot: string
  slot: number
  builderId: string
}

export interface ForkchoiceUpdatedV3Result {
  payloadStatus: EnginePayloadStatus
  payloadId: string
}

export interface GetPayloadV3Result {
  executionPayload: ExecutionPayloadV3
  blobsBundle: BlobsBundle
}

export interface NewPayloadV3Params {
  executionPayload: ExecutionPayloadV3
  blobsBundle: BlobsBundle
}

export interface NewPayloadV3Result {
  status: EnginePayloadStatus
  validationError: string | null
}

export interface BuildRecord {
  payloadId: string
  blockHash: string
  builderId: string
  slot: number
  state: BuildState
  createdAtMs: number
  fetchedAtMs: number | null
  firstBroadcastAtMs: number | null
  equivocatedAtMs: number | null
  validatedAtMs: number | null
  validationStatus: EnginePayloadStatus | null
  payload: ExecutionPayloadV3
  blobsBundle: BlobsBundle
  envelopes: EnvelopeObservation[]
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
  payloadId: string
  buildState: BuildState
  payloadArrived: boolean
  payloadObservedByPtcAt: number | null
  payloadTimelyByObservation: boolean
  newPayloadStatus: EnginePayloadStatus | null
  payloadDisposition: PayloadDisposition
  canonicalHead: CanonicalHead
  nextSlotExtends: CanonicalHead
}

export interface SlotResult {
  slot: number
  scenario: string
  mode: SimulationMode
  engineUrl: string
  timing: TimingConfig
  header: SignedBeaconBlockHeader
  payloadId: string
  payload: ExecutionPayloadEnvelope | null
  payloads: ExecutionPayloadEnvelope[]
  payloadDisposition: PayloadDisposition
  payloadStatus: PayloadStatus
  newPayloadStatus: EnginePayloadStatus | null
  newPayloadAttempted: boolean
  clAttestationVotes: CLAttestationVote[]
  clAttestationTally: VoteTally<CLAttestationVote>
  ptcVotes: PTCVote[]
  ptcTally: VoteTally<PTCVote>
  canonicalHead: CanonicalHead
  buildState: BuildState
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
  mode?: SimulationMode
  builderId?: string
  proposerId?: string
  builderValue: bigint
  builderFetchAtMs: number | null
  builderAction: BuilderAction
  broadcastDelayMs?: number
  networkDelayMs?: number
  equivocationGapMs?: number
  ptcPresentRatio?: number
  ptcSize?: number
  clHeadVoteRatio?: number
  clAttesterSize?: number
  validatorCallsNewPayload?: boolean
}

export interface SweepPoint {
  builderFetchAtMs: number | null
  observedByPtcAt: number | null
  newPayloadStatus: EnginePayloadStatus | null
  payloadDisposition: PayloadDisposition
  payloadStatus: PayloadStatus
  ptcPresent: number
  ptcAbsent: number
  canonicalHead: CanonicalHead
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string | null
  method: string
  params?: unknown[]
}

export interface JsonRpcSuccessResponse<TResult> {
  jsonrpc: '2.0'
  id: number | string | null
  result: TResult
}

export interface JsonRpcErrorObject {
  code: number
  message: string
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0'
  id: number | string | null
  error: JsonRpcErrorObject
}
