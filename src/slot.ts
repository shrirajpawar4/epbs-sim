import {
  buildClAttestationVotes,
  DEFAULT_CL_ATTESTER_SIZE,
  tallyClAttestationVotes
} from './entities/attesters.ts'
import { createBuilderBid, revealPayload } from './entities/builder.ts'
import { buildPtcVotes, DEFAULT_PTC_SIZE, tallyPtcVotes } from './entities/ptc.ts'
import { createSignedHeader } from './entities/proposer.ts'
import type {
  CanonicalHead,
  ExecutionPayload,
  ForkChoiceState,
  PayloadDisposition,
  PayloadStatus,
  ScenarioDefinition,
  SimulationMode,
  SlotResult,
  SweepPoint,
  TimingConfig,
  TimelineEvent
} from './types.ts'

export const SLOT_MS = 12_000
export const SPECISH_TIMING: TimingConfig = {
  slotMs: SLOT_MS,
  clAttestationMs: 3_000,
  aggregateMs: 6_000,
  ptcCutoffMs: 9_000
}

export const DIDACTIC_TIMING: TimingConfig = {
  slotMs: SLOT_MS,
  clAttestationMs: 6_000,
  aggregateMs: 8_000,
  ptcCutoffMs: 4_000
}

export function getTiming(mode: SimulationMode): TimingConfig {
  return mode === 'didactic' ? DIDACTIC_TIMING : SPECISH_TIMING
}

function payloadStatusFromPtcOutcome(ptcPresentMajority: boolean): PayloadStatus {
  return ptcPresentMajority ? 'FULL' : 'EMPTY'
}

function canonicalHeadFromStatus(payloadStatus: PayloadStatus): CanonicalHead {
  return payloadStatus === 'FULL' ? 'WITH_PAYLOAD' : 'WITHOUT_PAYLOAD'
}

function classifyPayloadDisposition(
  payload: ExecutionPayload | null,
  timing: TimingConfig,
  ptcPresentMajority: boolean
): PayloadDisposition {
  if (payload === null) return 'WITHHELD'
  if (!payload.gossipAccepted) return 'GOSSIP_REJECTED'
  if (!payload.hashMatchesCommit) return 'COMMITMENT_MISMATCH'
  if (!payload.executionValid) return 'EXECUTION_INVALID'
  if (payload.observedByPtcAt >= timing.ptcCutoffMs) return 'LATE_BY_OBSERVATION'
  if (!ptcPresentMajority) return 'PTC_REJECTED'
  return 'TIMELY_VALID'
}

function defaultPtcPresentRatio(payload: ExecutionPayload | null, timing: TimingConfig): number {
  if (payload === null) return 0
  if (!payload.gossipAccepted) return 0
  if (!payload.hashMatchesCommit) return 0
  if (!payload.executionValid) return 0
  return payload.observedByPtcAt < timing.ptcCutoffMs ? 1 : 0
}

function defaultClHeadVoteRatio(): number {
  return 1
}

function resolvePayload(config: ScenarioDefinition, timing: TimingConfig): ExecutionPayload | null {
  if (config.builderRevealsAt === null) return null

  const observedByPtcAt =
    config.payloadObservedByPtcAt === null
      ? timing.ptcCutoffMs + 1
      : (config.payloadObservedByPtcAt ?? config.builderRevealsAt)

  return revealPayload(
    config.builderRevealsAt,
    observedByPtcAt,
    config.payloadHashMatchesCommit ?? true,
    config.executionValid ?? true,
    config.gossipAccepted ?? true
  )
}

function buildForkChoiceState(
  payload: ExecutionPayload | null,
  timing: TimingConfig,
  payloadDisposition: PayloadDisposition,
  payloadStatus: PayloadStatus,
  canonicalHead: CanonicalHead
): ForkChoiceState {
  return {
    slotNHeaderAccepted: true,
    payloadArrived: payload !== null,
    payloadObservedByPtcAt: payload?.observedByPtcAt ?? null,
    payloadTimelyByObservation: payload !== null && payload.observedByPtcAt < timing.ptcCutoffMs,
    payloadHashMatchesCommit: payload?.hashMatchesCommit ?? false,
    payloadExecutionValid: payload?.executionValid ?? false,
    payloadGossipAccepted: payload?.gossipAccepted ?? false,
    payloadDisposition,
    payloadStatus,
    canonicalHead,
    nextSlotExtends: canonicalHead
  }
}

function logPayloadValidationEvent(
  payload: ExecutionPayload | null,
  timing: TimingConfig,
  payloadDisposition: PayloadDisposition,
  log: (
    t: number,
    actor: string,
    phase: TimelineEvent['phase'],
    event: string,
    data?: Record<string, unknown>
  ) => void
): void {
  const eventTime = payload?.revealedAt ?? timing.aggregateMs
  if (payloadDisposition === 'TIMELY_VALID') {
    log(eventTime, 'validator', 'PAYLOAD_VALIDATION', 'Payload passes toy validation checks', {
      disposition: payloadDisposition
    })
    return
  }

  log(eventTime, 'validator', 'PAYLOAD_VALIDATION', 'Payload fails toy validation or timeliness checks', {
    disposition: payloadDisposition
  })
}

export function runSlot(config: ScenarioDefinition): SlotResult {
  const mode = config.mode ?? 'spec-ish'
  const timing = getTiming(mode)
  const ptcSize = config.ptcSize ?? DEFAULT_PTC_SIZE
  const clAttesterSize = config.clAttesterSize ?? DEFAULT_CL_ATTESTER_SIZE
  const timeline: TimelineEvent[] = []
  const log = (
    t: number,
    actor: string,
    phase: TimelineEvent['phase'],
    event: string,
    data?: Record<string, unknown>
  ) => {
    timeline.push({ t, actor, phase, event, data })
  }

  const bid = createBuilderBid(config.builderValue)
  const header = createSignedHeader(config.slot, bid)
  log(0, 'proposer', 'HEADER_PROPOSED', 'Signed beacon block header broadcast', {
    bidValueWei: header.bid.value.toString(),
    payloadHash: header.bid.payloadHash,
    mode
  })

  const clHeadVoteRatio = config.clHeadVoteRatio ?? defaultClHeadVoteRatio()
  const clAttestationVotes = buildClAttestationVotes(clAttesterSize, clHeadVoteRatio)
  const clAttestationTally = tallyClAttestationVotes(clAttestationVotes)
  log(timing.clAttestationMs, 'attesters', 'CL_ATTESTATION', 'CL attesters vote on the beacon header path', {
    head: clAttestationTally.counts.HEAD,
    skip: clAttestationTally.counts.SKIP,
    committeeSize: clAttesterSize
  })

  const payload = resolvePayload(config, timing)
  if (payload !== null) {
    log(payload.revealedAt, 'builder', 'PAYLOAD_REVEALED', 'Builder reveals full execution payload', {
      blockHash: payload.blockHash,
      observedByPtcAt: payload.observedByPtcAt,
      hashMatchesCommit: payload.hashMatchesCommit,
      executionValid: payload.executionValid,
      gossipAccepted: payload.gossipAccepted
    })
  } else {
    log(timing.aggregateMs, 'builder', 'PAYLOAD_REVEALED', 'Builder withholds payload beyond reveal window')
  }

  log(timing.aggregateMs, 'network', 'ATTESTATION_AGGREGATES', 'CL aggregates for slot N are broadcast', {
    slot: config.slot
  })

  const ptcPresentRatio = config.ptcPresentRatio ?? defaultPtcPresentRatio(payload, timing)
  const ptcVotes = buildPtcVotes(ptcSize, ptcPresentRatio)
  const ptcTally = tallyPtcVotes(ptcVotes)
  const ptcPresentMajority = ptcTally.counts.PRESENT > ptcSize / 2
  const payloadDisposition = classifyPayloadDisposition(payload, timing, ptcPresentMajority)
  const payloadStatus = payloadStatusFromPtcOutcome(ptcPresentMajority)

  logPayloadValidationEvent(payload, timing, payloadDisposition, log)

  log(timing.ptcCutoffMs, 'ptc', 'PTC_VOTE', 'PTC votes on payload timeliness', {
    present: ptcTally.counts.PRESENT,
    absent: ptcTally.counts.ABSENT,
    committeeSize: ptcSize,
    observedPayloadAt: payload?.observedByPtcAt ?? null,
    payloadDisposition,
    payloadStatus
  })

  const canonicalHead = canonicalHeadFromStatus(payloadStatus)
  const nextSlotDecision = {
    slot: config.slot + 1,
    extends: canonicalHead,
    reason:
      canonicalHead === 'WITH_PAYLOAD'
        ? 'PTC majority marked payload timely, so slot N+1 extends FULL'
        : `Payload disposition ${payloadDisposition} collapses to EMPTY, so slot N+1 extends EMPTY`
  }
  const forkChoiceState = buildForkChoiceState(
    payload,
    timing,
    payloadDisposition,
    payloadStatus,
    canonicalHead
  )

  log(
    timing.slotMs,
    'fork-choice',
    'NEXT_SLOT_FORK_CHOICE',
    'Slot N+1 proposer extends the canonical branch',
    nextSlotDecision
  )
  log(timing.slotMs, 'slot', 'COMPLETE', 'Slot simulation complete', {
    canonicalHead,
    payloadDisposition
  })

  timeline.sort((left, right) => left.t - right.t)

  return {
    slot: config.slot,
    scenario: config.scenario,
    mode,
    timing,
    header,
    payload,
    payloadDisposition,
    payloadStatus,
    clAttestationVotes,
    clAttestationTally,
    ptcVotes,
    ptcTally,
    canonicalHead,
    forkChoiceState,
    nextSlotDecision,
    timeline
  }
}

export function runRevealSweep(
  revealTimes: Array<number | null>,
  baseConfig: Omit<ScenarioDefinition, 'slot' | 'scenario' | 'builderRevealsAt'>
): SweepPoint[] {
  return revealTimes.map((revealAt, index) => {
    const result = runSlot({
      slot: 1_000 + index,
      scenario: revealAt === null ? 'sweep_withheld' : `sweep_${revealAt}`,
      builderRevealsAt: revealAt,
      ...baseConfig
    })

    return {
      revealAt,
      observedByPtcAt: result.payload?.observedByPtcAt ?? null,
      payloadDisposition: result.payloadDisposition,
      payloadStatus: result.payloadStatus,
      ptcPresent: result.ptcTally.counts.PRESENT,
      ptcAbsent: result.ptcTally.counts.ABSENT,
      canonicalHead: result.canonicalHead
    }
  })
}
