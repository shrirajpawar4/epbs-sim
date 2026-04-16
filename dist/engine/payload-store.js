import { createHash } from 'node:crypto';
function clone(value) {
    return structuredClone(value);
}
function stableHex(input) {
    return `0x${createHash('sha256').update(input).digest('hex')}`;
}
export function deriveMockBlockHash(payloadAttributes) {
    return stableHex([
        'block',
        payloadAttributes.slot,
        payloadAttributes.builderId,
        payloadAttributes.timestamp,
        payloadAttributes.parentBeaconBlockRoot
    ].join(':'));
}
function deriveMockPayloadId(payloadAttributes) {
    return stableHex(['payload', payloadAttributes.slot, payloadAttributes.builderId].join(':')).slice(0, 34);
}
function createMockExecutionPayload(payloadAttributes) {
    const blockHash = deriveMockBlockHash(payloadAttributes);
    return {
        blockHash,
        parentHash: stableHex(`parent:${payloadAttributes.parentBeaconBlockRoot}`).slice(0, 66),
        feeRecipient: payloadAttributes.suggestedFeeRecipient,
        stateRoot: stableHex(`state:${blockHash}`).slice(0, 66),
        receiptsRoot: stableHex(`receipts:${blockHash}`).slice(0, 66),
        blockNumber: payloadAttributes.slot,
        timestamp: payloadAttributes.timestamp,
        transactions: [stableHex(`tx:${blockHash}:0`), stableHex(`tx:${blockHash}:1`)]
    };
}
function createMockBlobsBundle(blockHash) {
    return {
        commitments: [stableHex(`commitment:${blockHash}:0`)],
        proofs: [stableHex(`proof:${blockHash}:0`)],
        blobs: [stableHex(`blob:${blockHash}:0`)]
    };
}
function createEnvelopeObservation(envelope) {
    return {
        payloadId: envelope.payloadId,
        blockHash: envelope.executionPayload.blockHash,
        broadcastAtMs: envelope.broadcastAtMs,
        variant: envelope.variant
    };
}
export class PayloadStore {
    buildsByPayloadId = new Map();
    buildsByBlockHash = new Map();
    createBuild(payloadAttributes, createdAtMs) {
        const payloadId = deriveMockPayloadId(payloadAttributes);
        const payload = createMockExecutionPayload(payloadAttributes);
        const record = {
            payloadId,
            blockHash: payload.blockHash,
            builderId: payloadAttributes.builderId,
            slot: payloadAttributes.slot,
            state: 'BUILDING',
            createdAtMs,
            fetchedAtMs: null,
            firstBroadcastAtMs: null,
            equivocatedAtMs: null,
            validatedAtMs: null,
            validationStatus: null,
            payload,
            blobsBundle: createMockBlobsBundle(payload.blockHash),
            envelopes: []
        };
        this.buildsByPayloadId.set(payloadId, record);
        this.buildsByBlockHash.set(record.blockHash, record);
        return clone(record);
    }
    getPayload(payloadId, fetchedAtMs) {
        const record = this.requireBuild(payloadId);
        record.fetchedAtMs = fetchedAtMs;
        if (record.state === 'BUILDING')
            record.state = 'FETCHED';
        return clone({
            executionPayload: record.payload,
            blobsBundle: record.blobsBundle
        });
    }
    markWithheld(payloadId) {
        const record = this.requireBuild(payloadId);
        if (record.state !== 'EQUIVOCATED')
            record.state = 'WITHHELD';
        return clone(record);
    }
    recordEnvelope(payloadId, envelope) {
        const record = this.requireBuild(payloadId);
        const observation = createEnvelopeObservation(envelope);
        record.envelopes.push(observation);
        this.buildsByBlockHash.set(observation.blockHash, record);
        if (record.firstBroadcastAtMs === null) {
            record.firstBroadcastAtMs = envelope.broadcastAtMs;
            record.state = 'REVEALED';
            return clone(record);
        }
        if (observation.blockHash !== record.blockHash) {
            record.state = 'EQUIVOCATED';
            record.equivocatedAtMs = envelope.broadcastAtMs;
        }
        return clone(record);
    }
    validateNewPayload(params, validatedAtMs) {
        const record = this.buildsByBlockHash.get(params.executionPayload.blockHash);
        if (!record) {
            return {
                status: 'INVALID',
                validationError: 'unknown block hash'
            };
        }
        const bundleMatches = params.blobsBundle.commitments[0] === record.blobsBundle.commitments[0] &&
            params.blobsBundle.proofs[0] === record.blobsBundle.proofs[0];
        if (record.state === 'EQUIVOCATED' || params.executionPayload.blockHash !== record.blockHash || !bundleMatches) {
            record.validationStatus = 'INVALID';
            record.validatedAtMs = validatedAtMs;
            return {
                status: 'INVALID',
                validationError: record.state === 'EQUIVOCATED' ? 'build equivocated before validation' : 'payload mismatch'
            };
        }
        record.validationStatus = 'VALID';
        record.validatedAtMs = validatedAtMs;
        record.state = 'VALIDATED';
        return {
            status: 'VALID',
            validationError: null
        };
    }
    snapshotByPayloadId(payloadId) {
        const record = this.buildsByPayloadId.get(payloadId);
        return record ? clone(record) : undefined;
    }
    snapshotByBlockHash(blockHash) {
        const record = this.buildsByBlockHash.get(blockHash);
        return record ? clone(record) : undefined;
    }
    requireBuild(payloadId) {
        const record = this.buildsByPayloadId.get(payloadId);
        if (!record)
            throw new Error(`unknown payloadId ${payloadId}`);
        return record;
    }
}
