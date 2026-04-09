import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

function runCli(args: string[]): string {
  return execFileSync('node', ['dist/index.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
}

describe('CLI output', () => {
  it('prints the scenario timeline in milestone order', () => {
    const output = runCli([])

    expect(output).toContain('MEV-Boost contrast')
    expect(output).toContain('SLOT 1  HAPPY_PATH  [spec-ish]')
    expect(output).toContain('Signed beacon block header broadcast')
    expect(output).toContain('PTC votes on payload timeliness')
    expect(output).toContain('Payload disposition: TIMELY_VALID')
    expect(output).toContain('Fork-choice view: arrived=true')
    expect(output).toContain('Canonical head after slot 2: WITH_PAYLOAD')
  })

  it('prints a scenario matrix', () => {
    const output = runCli(['--format=matrix'])

    expect(output).toContain('scenario')
    expect(output).toContain('builder_withholds')
    expect(output).toContain('WITHOUT_PAYLOAD')
  })

  it('prints sweep output in markdown and csv', () => {
    const markdown = runCli(['--sweep', '--format=markdown'])
    const csv = runCli(['--sweep', '--format=csv'])

    expect(markdown).toContain('| revealAt | observedByPtcAt | payloadDisposition | payloadStatus |')
    expect(csv).toContain('revealAt,observedByPtcAt,payloadDisposition,payloadStatus,ptcPresent,ptcAbsent,canonicalHead')
  })
})
