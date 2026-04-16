# ePBS Simulator

This repo is a small TypeScript simulator for a specific ePBS coordination problem: the proposer and builder are no longer acting inside one clean local flow, and the timing across the Engine API boundary matters for fork choice.

The simulator is meant for explanation, experimentation, and quick iteration. It is not a full Ethereum client or a spec-accurate consensus implementation. The goal is to make the coordination path easy to inspect:

- the proposer asks the execution layer to start building a payload
- the builder fetches that payload through the Engine API
- the payload may be revealed on time, revealed late, withheld, or equivocated
- the PTC decides whether the payload counts as present in time
- the next slot extends either the full block or the empty version

## What changed

Earlier, the simulator mostly constructed payload outcomes directly inside the slot model.

Now, the simulator includes a mock Execution Layer behind a real localhost JSON-RPC Engine API boundary. That means the main actors go through explicit Engine calls:

- proposer calls `engine_forkchoiceUpdatedV3`
- builder calls `engine_getPayloadV3`
- validator-side ingest may call `engine_newPayloadV3`
- PTC and fork choice react to what was observed

That change is the point of the refactor. Timing is no longer attached to a payload after it already exists in memory. Instead, the timing comes from when the proposer, builder, and validator actually cross the Engine boundary.

## Main modules

- `src/engine/mock-engine-api.ts`: mock Engine API server
- `src/engine/payload-store.ts`: in-memory registry of payload builds
- `src/epbs/proposer.ts`: proposer-side Engine interaction
- `src/epbs/builder.ts`: builder-side payload fetch and envelope creation
- `src/epbs/ptc.ts`: PTC voting and payload classification
- `src/slot.ts`: end-to-end scenario runner

The simulator is still single-process for convenience, but the Engine boundary is real HTTP JSON-RPC on an ephemeral localhost port.

## Scenarios

The default scenarios are:

- `happy-path`: the builder fetches and reveals in time, validator-side ingest calls `engine_newPayloadV3`, the PTC votes `PRESENT`, and the next slot extends `WITH_PAYLOAD`
- `withhold`: the builder fetches the payload but never reveals an envelope, validator-side ingest never calls `engine_newPayloadV3`, the PTC votes `ABSENT`, and the next slot extends `WITHOUT_PAYLOAD`
- `late-reveal`: the builder delays the actual `engine_getPayloadV3` call until after the cutoff; the payload can still be `VALID` at `engine_newPayloadV3`, but it is too late for the PTC, so the next slot extends `WITHOUT_PAYLOAD`
- `equivocation`: the builder sends one payload envelope and then a conflicting second envelope for the same build; the second arrival marks the build `EQUIVOCATED`, validator-side ingest skips `engine_newPayloadV3`, the PTC votes `ABSENT`, and fork choice extends `WITHOUT_PAYLOAD`

## Sweep mode

`--sweep` now varies the time when the builder actually calls `engine_getPayloadV3`.

That matters because the sweep is no longer based on injected reveal timestamps. It is exercising the Engine-backed path directly, so the observed timing comes from the real fetch and reveal sequence.

In practice:

- early builder fetch times tend to produce `TIMELY_VALID`
- fetches at or after the cutoff produce `LATE_BY_OBSERVATION`
- no fetch produces `WITHHELD`

## Reading the output

Each scenario prints a timeline followed by a short summary.

The most useful fields are:

- `Payload disposition`: the main classification for what happened, such as `TIMELY_VALID`, `WITHHELD`, `LATE_BY_OBSERVATION`, or `EQUIVOCATED`
- `Payload status`: the simplified fork-choice outcome, `FULL` or `EMPTY`
- `newPayloadStatus`: the result from `engine_newPayloadV3` when that call is made
- `PTC votes`: the `PRESENT` vs `ABSENT` tally
- `Canonical head after slot N+1`: what the next slot builds on

## Setup

Requirements:

- Node.js 22 or newer
- npm

Install dependencies:

```bash
npm install
```

## Running the simulator

Run the default scenario timelines:

```bash
npm run dev
```

Run the didactic timing mode:

```bash
npm run dev -- --mode=didactic
```

Print a compact matrix instead of full timelines:

```bash
npm run dev -- --format=matrix
```

Run the builder-fetch sweep:

```bash
npm run sweep
```

Export sweep output as Markdown:

```bash
npm run sweep:markdown
```

Export sweep output as CSV:

```bash
npm run sweep:csv
```

## Testing

Type-check the code:

```bash
npm run typecheck
```

Build the CLI:

```bash
npm run build
```

Run the full test suite:

```bash
npm test
```

The tests cover:

- Engine API request and response flow
- payload-store behavior
- the four main scenarios
- sweep behavior around the cutoff
- CLI output

## Note on localhost binding

The mock Engine API opens a localhost port. In a normal local environment, `npm run dev` and `npm test` should work directly. In a restricted sandbox, those commands may fail if the process is not allowed to bind a port.

## Simplifications

- this is not a full consensus or execution client
- Engine payloads use minimal toy data rather than full spec objects
- blobs data is deterministic mock data used to keep the `getPayloadV3` flow realistic
- committee behavior is deterministic and ratio-based
- the simulator uses one canonical observer view rather than multiple competing network views

## References

- EIP-7732: https://eips.ethereum.org/EIPS/eip-7732
- ePBS design constraints: https://ethresear.ch/t/epbs-design-constraints/18728
