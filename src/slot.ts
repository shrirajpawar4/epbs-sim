import {
  buildClAttestationVotes,
  DEFAULT_CL_ATTESTER_SIZE,
  tallyClAttestationVotes
} from './epbs/attesters.ts'
import {
  createEquivocationEnvelope,
  fetchPayloadEnvelope,
  withBroadcastDelay
} from './epbs/builder.ts'
import {
  buildPtcVotes,
  canonicalHeadFromStatus,
  classifyPayloadDisposition,
  DEFAULT_PTC_SIZE,
  defaultPtcPresentRatio,
  payloadStatusFromPtcOutcome,
  tallyPtcVotes
} from './epbs/ptc.ts'
import { proposeHeader } from './epbs/proposer.ts'
import { callEngineRpc, MockEngineApiServer, type RpcLogger } from './engine/mock-engine-api.ts'
import { PayloadStore } from './engine/payload-store.ts'
import type {
  BuildRecord,
  CanonicalHead,
  EnginePayloadStatus,
  ExecutionPayloadEnvelope,
  ForkChoiceState,
  NewPayloadV3Params,
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

interface RunSlotOptions {
  rpcLogger?: RpcLogger
}

function defaultClHeadVoteRatio(): number {
  return 1
}

function buildForkChoiceState(
  payloadId: string,
  payload: ExecutionPayloadEnvelope | null,
  build: BuildRecord,
  observedByPtcAt: number | null,
  newPayloadStatus: EnginePayloadStatus | null,
  payloadDisposition: PayloadDisposition,
  canonicalHead: CanonicalHead,
  timing: TimingConfig
): ForkChoiceState {
  return {
    slotNHeaderAccepted: true,
    payloadId,
    buildState: build.state,
    payloadArrived: payload !== null,
    payloadObservedByPtcAt: observedByPtcAt,
    payloadTimelyByObservation: observedByPtcAt !== null && observedByPtcAt < timing.ptcCutoffMs,
    newPayloadStatus,
    payloadDisposition,
    canonicalHead,
    nextSlotExtends: canonicalHead
  }
}

async function validateEnvelope(
  engineUrl: string,
  envelope: ExecutionPayloadEnvelope,
  atMs: number,
  rpcLogger?: RpcLogger
): Promise<EnginePayloadStatus> {
  const result = await callEngineRpc<{ status: EnginePayloadStatus }>(
    engineUrl,
    'engine_newPayloadV3',
    [
      {
        executionPayload: envelope.executionPayload,
        blobsBundle: envelope.blobsBundle
      } satisfies NewPayloadV3Params
    ],
    atMs,
    { logger: rpcLogger }
  )

  return result.status
}

export async function runSlot(config: ScenarioDefinition, options: RunSlotOptions = {}): Promise<SlotResult> {
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

  const store = new PayloadStore()
  const engine = new MockEngineApiServer(store)
  await engine.start()

  try {
    const { header, payloadId } = await proposeHeader(engine.url, config, 0, options.rpcLogger)
    log(0, 'proposer', 'ENGINE_FORKCHOICE_UPDATED', 'Proposer calls engine_forkchoiceUpdatedV3', {
      payloadId,
      slot: config.slot
    })
    log(0, 'proposer', 'HEADER_PROPOSED', 'Signed beacon block header broadcast', {
      bidValueWei: header.bid.value.toString(),
      payloadHash: header.bid.payloadHash,
      payloadId,
      mode
    })

    const clHeadVoteRatio = config.clHeadVoteRatio ?? defaultClHeadVoteRatio()
    const clAttestationVotes = buildClAttestationVotes(clAttesterSize, clHeadVoteRatio)
    const clAttestationTally = tallyClAttestationVotes(clAttestationVotes)
    log(timing.clAttestationMs, 'attesters', 'CL_ATTESTATION', 'CL attesters vote on the header path', {
      head: clAttestationTally.counts.HEAD,
      skip: clAttestationTally.counts.SKIP,
      committeeSize: clAttesterSize
    })

    log(timing.aggregateMs, 'network', 'ATTESTATION_AGGREGATES', 'CL aggregates for slot N are broadcast', {
      slot: config.slot
    })

    const payloads: ExecutionPayloadEnvelope[] = []
    let payload: ExecutionPayloadEnvelope | null = null
    let observedByPtcAt: number | null = null
    let newPayloadStatus: EnginePayloadStatus | null = null
    let newPayloadAttempted = false

    if (config.builderFetchAtMs !== null) {
      const builderId = config.builderId ?? 'builder-0'
      const fetchedEnvelope = await fetchPayloadEnvelope(
        engine.url,
        payloadId,
        builderId,
        config.builderFetchAtMs,
        options.rpcLogger
      )
      log(config.builderFetchAtMs, 'builder', 'ENGINE_GET_PAYLOAD', 'Builder calls engine_getPayloadV3', {
        payloadId,
        blockHash: fetchedEnvelope.executionPayload.blockHash
      })

      if (config.builderAction === 'withhold') {
        store.markWithheld(payloadId)
        log(config.builderFetchAtMs, 'builder', 'PAYLOAD_REVEALED', 'Builder withholds envelope after engine_getPayloadV3', {
          payloadId,
          blockHash: fetchedEnvelope.executionPayload.blockHash
        })
      } else if (config.builderAction === 'equivocate') {
        const firstEnvelope = withBroadcastDelay(
          fetchedEnvelope,
          fetchedEnvelope.broadcastAtMs + (config.broadcastDelayMs ?? 0)
        )
        const secondEnvelope = createEquivocationEnvelope(
          firstEnvelope,
          firstEnvelope.broadcastAtMs + (config.equivocationGapMs ?? 100)
        )

        store.recordEnvelope(payloadId, firstEnvelope)
        payloads.push(firstEnvelope)
        payload = firstEnvelope
        log(firstEnvelope.broadcastAtMs, 'builder', 'PAYLOAD_REVEALED', 'Builder broadcasts first payload envelope', {
          payloadId,
          blockHash: firstEnvelope.executionPayload.blockHash,
          variant: firstEnvelope.variant
        })

        const updatedBuild = store.recordEnvelope(payloadId, secondEnvelope)
        payloads.push(secondEnvelope)
        observedByPtcAt = secondEnvelope.broadcastAtMs + (config.networkDelayMs ?? 0)
        log(secondEnvelope.broadcastAtMs, 'builder', 'PAYLOAD_REVEALED', 'Builder broadcasts conflicting payload envelope', {
          payloadId,
          blockHash: secondEnvelope.executionPayload.blockHash,
          variant: secondEnvelope.variant
        })
        log(secondEnvelope.broadcastAtMs, 'validator', 'PAYLOAD_VALIDATION', 'Validator suppresses engine_newPayloadV3 after equivocation', {
          payloadId,
          buildState: updatedBuild.state
        })
      } else {
        const broadcastEnvelope = withBroadcastDelay(
          fetchedEnvelope,
          fetchedEnvelope.broadcastAtMs + (config.broadcastDelayMs ?? 0)
        )
        store.recordEnvelope(payloadId, broadcastEnvelope)
        payloads.push(broadcastEnvelope)
        payload = broadcastEnvelope
        observedByPtcAt = broadcastEnvelope.broadcastAtMs + (config.networkDelayMs ?? 0)

        log(broadcastEnvelope.broadcastAtMs, 'builder', 'PAYLOAD_REVEALED', 'Builder broadcasts execution payload envelope', {
          payloadId,
          blockHash: broadcastEnvelope.executionPayload.blockHash,
          observedByPtcAt
        })

        if (config.validatorCallsNewPayload ?? true) {
          newPayloadAttempted = true
          newPayloadStatus = await validateEnvelope(engine.url, broadcastEnvelope, observedByPtcAt, options.rpcLogger)
          log(observedByPtcAt, 'validator', 'PAYLOAD_VALIDATION', 'Validator calls engine_newPayloadV3', {
            payloadId,
            status: newPayloadStatus
          })
        }
      }
    } else {
      store.markWithheld(payloadId)
      log(timing.aggregateMs, 'builder', 'PAYLOAD_REVEALED', 'Builder never calls engine_getPayloadV3', {
        payloadId
      })
    }

    const build = store.snapshotByPayloadId(payloadId)
    if (!build) throw new Error(`missing build snapshot for payloadId ${payloadId}`)

    const ptcPresentRatio =
      config.ptcPresentRatio ??
      defaultPtcPresentRatio(payload, build.state, observedByPtcAt, newPayloadStatus, timing)
    const ptcVotes = buildPtcVotes(ptcSize, ptcPresentRatio)
    const ptcTally = tallyPtcVotes(ptcVotes)
    const ptcPresentMajority = ptcTally.counts.PRESENT > ptcSize / 2

    const payloadDisposition = classifyPayloadDisposition(
      payload,
      build.state,
      observedByPtcAt,
      newPayloadStatus,
      timing,
      ptcPresentMajority
    )
    const payloadStatus = payloadStatusFromPtcOutcome(ptcPresentMajority)
    const canonicalHead = canonicalHeadFromStatus(payloadStatus)

    log(timing.ptcCutoffMs, 'ptc', 'PTC_VOTE', 'PTC votes on payload presence across the Engine boundary', {
      present: ptcTally.counts.PRESENT,
      absent: ptcTally.counts.ABSENT,
      committeeSize: ptcSize,
      observedPayloadAt: observedByPtcAt,
      payloadDisposition,
      newPayloadStatus
    })

    const nextSlotDecision = {
      slot: config.slot + 1,
      extends: canonicalHead,
      reason:
        canonicalHead === 'WITH_PAYLOAD'
          ? 'Payload stayed timely and valid across the Engine boundary, so slot N+1 extends FULL'
          : `Payload disposition ${payloadDisposition} collapses to EMPTY, so slot N+1 extends EMPTY`
    }
    const forkChoiceState = buildForkChoiceState(
      payloadId,
      payload,
      build,
      observedByPtcAt,
      newPayloadStatus,
      payloadDisposition,
      canonicalHead,
      timing
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
      payloadDisposition,
      buildState: build.state
    })

    timeline.sort((left, right) => left.t - right.t)

    return {
      slot: config.slot,
      scenario: config.scenario,
      mode,
      engineUrl: engine.url,
      timing,
      header,
      payloadId,
      payload,
      payloads,
      payloadDisposition,
      payloadStatus,
      newPayloadStatus,
      newPayloadAttempted,
      clAttestationVotes,
      clAttestationTally,
      ptcVotes,
      ptcTally,
      canonicalHead,
      buildState: build.state,
      forkChoiceState,
      nextSlotDecision,
      timeline
    }
  } finally {
    await engine.stop()
  }
}

export async function runBuilderFetchSweep(
  builderFetchTimes: Array<number | null>,
  baseConfig: Omit<ScenarioDefinition, 'slot' | 'scenario' | 'builderFetchAtMs'>,
  options: RunSlotOptions = {}
): Promise<SweepPoint[]> {
  const points: SweepPoint[] = []
  for (const [index, builderFetchAtMs] of builderFetchTimes.entries()) {
    const result = await runSlot(
      {
        slot: 1_000 + index,
        scenario: builderFetchAtMs === null ? 'sweep_withhold' : `sweep_${builderFetchAtMs}`,
        builderFetchAtMs,
        ...baseConfig
      },
      options
    )

    points.push({
      builderFetchAtMs,
      observedByPtcAt: result.forkChoiceState.payloadObservedByPtcAt,
      newPayloadStatus: result.newPayloadStatus,
      payloadDisposition: result.payloadDisposition,
      payloadStatus: result.payloadStatus,
      ptcPresent: result.ptcTally.counts.PRESENT,
      ptcAbsent: result.ptcTally.counts.ABSENT,
      canonicalHead: result.canonicalHead
    })
  }

  return points
}
