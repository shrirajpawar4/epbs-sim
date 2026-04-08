# ePBS Simulator

This is a toy TypeScript simulator for enshrined proposer-builder separation under [EIP-7732](https://eips.ethereum.org/EIPS/eip-7732). It is meant for learning, explanation, and quick design feedback, not as a consensus-spec implementation. The core point it tries to make tangible is that ePBS introduces an extra decision phase beyond MEV-Boost: the chain first accepts a proposer header that commits to a builder bid, and then separately decides whether the execution payload arrived in time, which determines whether the next slot extends the `FULL` or `EMPTY` version of that block.

If you show this to core Ethereum people, present it that way: deterministic teaching simulator, simplified majority-rule fork choice, and a tool for checking intuition about timing, withholding, delayed observation, and `FULL` vs `EMPTY` outcomes.

## what this simulator is showing

Think of the proposer as saying, "I picked this builder's block," before everyone has seen the actual payload.

Then the chain asks a second question: "Did the payload show up in time, and does it match what was promised?"

That second question is the whole point of the toy:
- if the payload arrives in time and matches the commitment, the next slot extends `WITH_PAYLOAD`
- if the payload is missing, late, or mismatched, the next slot extends `WITHOUT_PAYLOAD`

That is the extra ePBS phase this simulator is trying to make tangible.

## How to read the output

Each scenario prints a timeline followed by a summary:
- `Payload status` is the toy model's final verdict for the slot: `FULL` or `EMPTY`
- `Fork-choice view` separates "payload exists" from "payload was seen in time by the PTC"
- `PTC votes` show whether the payload was considered present before the cutoff
- `Canonical head after slot N+1` shows what the next slot builds on

In plain English:
- proposer commits first
- builder reveals later
- PTC decides whether the reveal counts as on time
- the next slot extends either the full block or the empty/header-only version

## How to read the scenarios

- `happy_path`: builder reveals in time, PTC says `PRESENT`, next slot extends `WITH_PAYLOAD`
- `builder_withholds`: builder never reveals, PTC says `ABSENT`, next slot extends `WITHOUT_PAYLOAD`
- `late_payload`: builder reveals after the cutoff, so the payload exists but is too late to count
- `hash_mismatch`: builder reveals a payload that does not match the header commitment, so the toy rejects it
- `early_payload_noisy_ptc`: payload is on time, but not every PTC voter agrees; majority still says present
- `delayed_network_view`: builder reveals before the cutoff, but the PTC's observed arrival is after the cutoff

## What it models

- `happy_path`: payload is revealed on time, PTC votes `PRESENT`, next slot extends `FULL`
- `builder_withholds`: proposer commits to the bid but builder never reveals, PTC votes `ABSENT`, next slot extends `EMPTY`
- `late_payload`: payload arrives after the cutoff, a minority PTC split does not prevent `EMPTY`
- `hash_mismatch`: payload arrives but does not match the committed hash, so the toy treats it as absent for fork-choice purposes
- `early_payload_noisy_ptc`: payload arrives on time but PTC support is noisy rather than unanimous
- `delayed_network_view`: payload is revealed before the cutoff, but the PTC’s observed arrival is after the cutoff

## Simplifications

- This does not implement real validator duties, proposer boost, or exact LMD-GHOST math.
- Committee behavior is deterministic and configured as simple vote ratios.
- Execution validity, blobs, data availability, inclusion lists, and payment settlement are out of scope.
- Builder penalties for withholding are out of scope.
- Payload validity is simplified to commitment/hash matching rather than full `process_execution_payload` validation.
- Spec-ish timing uses `3s/6s/9s` based on an earlier draft snapshot. The exact slot-component cutoffs have shifted across revisions, so verify against the `consensus-specs` `dev` branch before treating these numbers as normative.
- Two modes are supported:
  - `spec-ish`: uses the draft-style `t=3s` CL attestation, `t=6s` aggregates, `t=9s` PTC cutoff
  - `didactic`: uses a simplified teaching timeline closer to `0/3/4/6/8`

## Client / gossip relevance

This simulator is also relevant to client gossip handling. EIP-7732 separates beacon-block and execution-payload dissemination, and the toy models the timing constraint that gossip validation and payload-attestation handling must enforce when deciding whether a payload counts as present in time for fork choice.

## Local setup

Requirements:
- Node.js 22 or newer
- npm

Install dependencies:

```bash
npm install
```

Run the default scenario timelines:

```bash
npm run dev
```

Run the didactic timeline:

```bash
npm run dev -- --mode=didactic
```

Print a compact scenario matrix instead of full timelines:

```bash
npm run dev -- --format=matrix
```

Sweep reveal times across the slot:

```bash
npm run sweep
```

Export the sweep as Markdown:

```bash
npm run sweep:markdown
```

Export the sweep as CSV:

```bash
npm run sweep:csv
```

Type-check the project:

```bash
npm run typecheck
```

Build the compiled CLI output:

```bash
npm run build
```

Run the test suite:

```bash
npm test
```

## How to test it locally

For quick confidence:
- Run `npm run typecheck`
- Run `npm run build`
- Run `npm test`
- Run `npm run dev`
- Run `npm run sweep`

For boundary testing:
- Inspect the reveal-time flip at `8999`, `9000`, and `9001` in `spec-ish` mode
- Run `npm run sweep:markdown` and look for the point where `canonicalHead` changes from `WITH_PAYLOAD` to `WITHOUT_PAYLOAD`

## What the sweep means

The sweep runs the same slot model many times with different reveal times.

It is useful because it shows the exact point where the result flips:
- up to `8999ms`, the toy says `WITH_PAYLOAD`
- at `9000ms` and later, the toy says `WITHOUT_PAYLOAD`

That flip point is the timing constraint made visible as a table.

## References

- EIP-7732: https://eips.ethereum.org/EIPS/eip-7732
- ePBS design constraints: https://ethresear.ch/t/epbs-design-constraints/18728
