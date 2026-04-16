import { callEngineRpc, type RpcLogger } from '../engine/mock-engine-api.ts'
import { deriveMockBlockHash } from '../engine/payload-store.ts'
import type {
  BuilderBid,
  ForkchoiceStateV3,
  ForkchoiceUpdatedV3Result,
  PayloadAttributesV3,
  ScenarioDefinition,
  SignedBeaconBlockHeader
} from '../types.ts'

function createForkchoiceState(slot: number): ForkchoiceStateV3 {
  const blockHash = `0x${slot.toString(16).padStart(64, '0')}`
  return {
    headBlockHash: blockHash,
    safeBlockHash: blockHash,
    finalizedBlockHash: blockHash
  }
}

export function createPayloadAttributes(config: ScenarioDefinition): PayloadAttributesV3 {
  const builderId = config.builderId ?? 'builder-0'
  return {
    timestamp: config.slot * 12,
    prevRandao: `0x${config.slot.toString(16).padStart(64, '0')}`,
    suggestedFeeRecipient: '0x00000000000000000000000000000000fee1dead',
    parentBeaconBlockRoot: `0x${(config.slot - 1).toString(16).padStart(64, '0')}`,
    slot: config.slot,
    builderId
  }
}

function createBuilderBid(config: ScenarioDefinition, payloadAttributes: PayloadAttributesV3): BuilderBid {
  return {
    builderId: payloadAttributes.builderId,
    value: config.builderValue,
    payloadHash: deriveMockBlockHash(payloadAttributes),
    committed: true
  }
}

export async function proposeHeader(
  engineUrl: string,
  config: ScenarioDefinition,
  atMs = 0,
  rpcLogger?: RpcLogger
): Promise<{ header: SignedBeaconBlockHeader; payloadId: string; payloadAttributes: PayloadAttributesV3 }> {
  const payloadAttributes = createPayloadAttributes(config)
  const result = await callEngineRpc<ForkchoiceUpdatedV3Result>(
    engineUrl,
    'engine_forkchoiceUpdatedV3',
    [createForkchoiceState(config.slot), payloadAttributes],
    atMs,
    { logger: rpcLogger }
  )

  const header: SignedBeaconBlockHeader = {
    slot: config.slot,
    proposerId: config.proposerId ?? 'proposer-0',
    parentRoot: payloadAttributes.parentBeaconBlockRoot,
    bid: createBuilderBid(config, payloadAttributes),
    signature: '0xsigned-header',
    payloadId: result.payloadId
  }

  return {
    header,
    payloadId: result.payloadId,
    payloadAttributes
  }
}
