import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

function runCli(args: string[]): string {
  return execFileSync('node', ['dist/index.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
}

describe('CLI output', () => {
  it('prints the engine-backed scenario timeline in milestone order', () => {
    const output = runCli([])

    expect(output).toContain('Engine boundary')
    expect(output).toContain('Mock Engine API: http://127.0.0.1:')
    expect(output).toContain('SLOT 1  HAPPY-PATH  [spec-ish]')
    expect(output).toContain('Proposer calls engine_forkchoiceUpdatedV3')
    expect(output).toContain('Builder calls engine_getPayloadV3')
    expect(output).toContain('Validator calls engine_newPayloadV3')
    expect(output).toContain('Payload disposition: TIMELY_VALID')
    expect(output).toContain('Canonical head after slot 2: WITH_PAYLOAD')
  })

  it('prints a scenario matrix', () => {
    const output = runCli(['--format=matrix'])

    expect(output).toContain('scenario')
    expect(output).toContain('equivocation')
    expect(output).toContain('EQUIVOCATED')
    expect(output).toContain('payloadId')
  })

  it('prints sweep output in markdown and csv using builder fetch timing', () => {
    const markdown = runCli(['--sweep', '--format=markdown'])
    const csv = runCli(['--sweep', '--format=csv'])

    expect(markdown).toContain('| builderFetchAt | observedByPtcAt | newPayloadStatus | payloadDisposition |')
    expect(csv).toContain('builderFetchAt,observedByPtcAt,newPayloadStatus,payloadDisposition,payloadStatus,ptcPresent,ptcAbsent,canonicalHead')
  })

  it('prints JSON-RPC requests and responses in debug mode', () => {
    const output = runCli(['--debug-rpc'])

    expect(output).toContain('[rpc] -> http://127.0.0.1:')
    expect(output).toContain('"method":"engine_forkchoiceUpdatedV3"')
    expect(output).toContain('[rpc] <- http://127.0.0.1:')
    expect(output).toContain('"jsonrpc":"2.0"')
  })
})
