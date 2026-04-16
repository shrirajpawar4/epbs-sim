import { createHash } from 'node:crypto';
import { callEngineRpc } from "../engine/mock-engine-api.js";
function mutateHex(input) {
    return `0x${createHash('sha256').update(input).digest('hex')}`;
}
export async function fetchPayloadEnvelope(engineUrl, payloadId, builderId, fetchAtMs, rpcLogger) {
    const result = await callEngineRpc(engineUrl, 'engine_getPayloadV3', [payloadId], fetchAtMs, { logger: rpcLogger });
    return {
        payloadId,
        builderId,
        executionPayload: result.executionPayload,
        blobsBundle: result.blobsBundle,
        broadcastAtMs: fetchAtMs,
        variant: 'primary'
    };
}
export function withBroadcastDelay(envelope, broadcastAtMs) {
    return {
        ...envelope,
        broadcastAtMs
    };
}
export function createEquivocationEnvelope(envelope, broadcastAtMs) {
    const conflictedHash = mutateHex(`${envelope.executionPayload.blockHash}:equivocation`);
    return {
        ...envelope,
        broadcastAtMs,
        variant: 'equivocation',
        executionPayload: {
            ...envelope.executionPayload,
            blockHash: conflictedHash,
            stateRoot: mutateHex(`${conflictedHash}:state`),
            receiptsRoot: mutateHex(`${conflictedHash}:receipts`),
            transactions: envelope.executionPayload.transactions.map((tx, index) => mutateHex(`${tx}:${index}:equivocated`))
        },
        blobsBundle: {
            commitments: envelope.blobsBundle.commitments.map((commitment, index) => mutateHex(`${commitment}:${index}:equivocated`)),
            proofs: envelope.blobsBundle.proofs.map((proof, index) => mutateHex(`${proof}:${index}:equivocated`)),
            blobs: envelope.blobsBundle.blobs.map((blob, index) => mutateHex(`${blob}:${index}:equivocated`))
        }
    };
}
