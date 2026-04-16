import { createServer } from 'node:http';
function formatSimTime(timeMs) {
    return `t=${(timeMs / 1000).toFixed(1)}s`;
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request)
        chunks.push(Buffer.from(chunk));
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function writeJson(response, payload) {
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(payload));
}
function simTimeMs(request) {
    const raw = request.headers['x-sim-time-ms'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}
export class MockEngineApiServer {
    store;
    server;
    port = null;
    constructor(store) {
        this.store = store;
        this.server = createServer((request, response) => {
            void this.handle(request, response);
        });
    }
    get url() {
        if (this.port === null)
            throw new Error('mock engine server not started');
        return `http://127.0.0.1:${this.port}`;
    }
    async start() {
        if (this.port !== null)
            return;
        await new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(0, '127.0.0.1', () => {
                this.server.off('error', reject);
                const address = this.server.address();
                if (!address || typeof address === 'string') {
                    reject(new Error('failed to bind mock engine api server'));
                    return;
                }
                this.port = address.port;
                resolve();
            });
        });
    }
    async stop() {
        if (this.port === null)
            return;
        await new Promise((resolve, reject) => {
            this.server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        this.port = null;
    }
    async handle(request, response) {
        if (request.method !== 'POST') {
            response.statusCode = 405;
            response.end();
            return;
        }
        try {
            const body = await readJsonBody(request);
            const timeMs = simTimeMs(request);
            const result = this.dispatch(body.method, body.params ?? [], timeMs);
            writeJson(response, {
                jsonrpc: '2.0',
                id: body.id,
                result
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'unknown engine api error';
            writeJson(response, {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32000,
                    message
                }
            });
        }
    }
    dispatch(method, params, timeMs) {
        if (method === 'engine_forkchoiceUpdatedV3') {
            const [, payloadAttributes] = params;
            const record = this.store.createBuild(payloadAttributes, timeMs);
            const result = {
                payloadStatus: 'VALID',
                payloadId: record.payloadId
            };
            return result;
        }
        if (method === 'engine_getPayloadV3') {
            const [payloadId] = params;
            return this.store.getPayload(payloadId, timeMs);
        }
        if (method === 'engine_newPayloadV3') {
            const [payloadParams] = params;
            return this.store.validateNewPayload(payloadParams, timeMs);
        }
        throw new Error(`unsupported engine method ${method}`);
    }
}
export async function callEngineRpc(engineUrl, method, params, timeMs, options = {}) {
    const requestBody = {
        jsonrpc: '2.0',
        id: 1,
        method,
        params
    };
    options.logger?.(`[rpc] -> ${engineUrl} ${formatSimTime(timeMs)} ${JSON.stringify(requestBody)}`);
    const response = await fetch(engineUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-sim-time-ms': String(timeMs)
        },
        body: JSON.stringify(requestBody)
    });
    const payload = (await response.json());
    options.logger?.(`[rpc] <- ${engineUrl} ${formatSimTime(timeMs)} ${JSON.stringify(payload)}`);
    if ('error' in payload)
        throw new Error(payload.error.message);
    return payload.result;
}
