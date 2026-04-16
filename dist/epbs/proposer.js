import { callEngineRpc } from "../engine/mock-engine-api.js";
import { deriveMockBlockHash } from "../engine/payload-store.js";
function createForkchoiceState(slot) {
    const blockHash = `0x${slot.toString(16).padStart(64, '0')}`;
    return {
        headBlockHash: blockHash,
        safeBlockHash: blockHash,
        finalizedBlockHash: blockHash
    };
}
export function createPayloadAttributes(config) {
    const builderId = config.builderId ?? 'builder-0';
    return {
        timestamp: config.slot * 12,
        prevRandao: `0x${config.slot.toString(16).padStart(64, '0')}`,
        suggestedFeeRecipient: '0x00000000000000000000000000000000fee1dead',
        parentBeaconBlockRoot: `0x${(config.slot - 1).toString(16).padStart(64, '0')}`,
        slot: config.slot,
        builderId
    };
}
function createBuilderBid(config, payloadAttributes) {
    return {
        builderId: payloadAttributes.builderId,
        value: config.builderValue,
        payloadHash: deriveMockBlockHash(payloadAttributes),
        committed: true
    };
}
export async function proposeHeader(engineUrl, config, atMs = 0, rpcLogger) {
    const payloadAttributes = createPayloadAttributes(config);
    const result = await callEngineRpc(engineUrl, 'engine_forkchoiceUpdatedV3', [createForkchoiceState(config.slot), payloadAttributes], atMs, { logger: rpcLogger });
    const header = {
        slot: config.slot,
        proposerId: config.proposerId ?? 'proposer-0',
        parentRoot: payloadAttributes.parentBeaconBlockRoot,
        bid: createBuilderBid(config, payloadAttributes),
        signature: '0xsigned-header',
        payloadId: result.payloadId
    };
    return {
        header,
        payloadId: result.payloadId,
        payloadAttributes
    };
}
