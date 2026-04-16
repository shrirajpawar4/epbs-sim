import { runAllScenarios } from './scenarios.ts'
import { DIDACTIC_TIMING, runBuilderFetchSweep, SPECISH_TIMING } from './slot.ts'
import type { SimulationMode, SlotResult, SweepPoint } from './types.ts'

type OutputFormat = 'timeline' | 'matrix' | 'markdown' | 'csv'

interface CliOptions {
  mode: SimulationMode
  format: OutputFormat
  scenarioSet: 'scenarios' | 'sweep'
  debugRpc: boolean
}

function padCell(value: string | number | boolean, width: number): string {
  return String(value).padEnd(width)
}

function printFixedWidthTable(headers: string[], rows: Array<Array<string | number | boolean>>): void {
  const widths = headers.map((header, index) => {
    const rowWidth = rows.reduce((max, row) => Math.max(max, String(row[index] ?? '').length), header.length)
    return rowWidth + 2
  })

  const formatRow = (row: Array<string | number | boolean>): string =>
    row.map((cell, index) => padCell(cell, widths[index] ?? 0)).join('')

  console.log(formatRow(headers))
  console.log(widths.map((width) => '-'.repeat(Math.max(width - 1, 1))).join(' '))
  for (const row of rows) console.log(formatRow(row))
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'spec-ish',
    format: 'timeline',
    scenarioSet: 'scenarios',
    debugRpc: false
  }

  for (const arg of argv) {
    if (arg === '--didactic') options.mode = 'didactic'
    if (arg === '--spec-ish') options.mode = 'spec-ish'
    if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length)
      if (value === 'didactic' || value === 'spec-ish') options.mode = value
    }
    if (arg.startsWith('--format=')) {
      const value = arg.slice('--format='.length)
      if (value === 'timeline' || value === 'matrix' || value === 'markdown' || value === 'csv') {
        options.format = value
      }
    }
    if (arg === '--sweep') options.scenarioSet = 'sweep'
    if (arg === '--debug-rpc') options.debugRpc = true
  }

  return options
}

function formatTime(t: number): string {
  return `t=${(t / 1000).toFixed(1)}s`
}

function printScenario(result: SlotResult): void {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`SLOT ${result.slot}  ${result.scenario.toUpperCase()}  [${result.mode}]`)
  console.log('='.repeat(72))
  console.log('Engine boundary: proposer triggers a build with FCU, builder fetches with getPayload, validator ingests with newPayload when the scenario allows it.')
  console.log(`Mock Engine API: ${result.engineUrl}`)

  for (const event of result.timeline) {
    const suffix = event.data ? ` ${JSON.stringify(event.data)}` : ''
    console.log(`  ${formatTime(event.t).padEnd(8)} [${event.actor.padEnd(11)}] ${event.event}${suffix}`)
  }

  console.log(`\n  Payload ID: ${result.payloadId}`)
  console.log(`  Payload disposition: ${result.payloadDisposition}`)
  console.log(`  Payload status: ${result.payloadStatus}`)
  console.log(
    `  Fork-choice view: arrived=${result.forkChoiceState.payloadArrived}, observedByPtcAt=${result.forkChoiceState.payloadObservedByPtcAt}, timely=${result.forkChoiceState.payloadTimelyByObservation}, buildState=${result.forkChoiceState.buildState}, newPayloadStatus=${result.forkChoiceState.newPayloadStatus}`
  )
  console.log(
    `  CL attesters: HEAD=${result.clAttestationTally.counts.HEAD}, SKIP=${result.clAttestationTally.counts.SKIP}`
  )
  console.log(
    `  PTC votes: PRESENT=${result.ptcTally.counts.PRESENT}, ABSENT=${result.ptcTally.counts.ABSENT}`
  )
  console.log(`  Canonical head after slot ${result.nextSlotDecision.slot}: ${result.canonicalHead}`)
  console.log(`  Reason: ${result.nextSlotDecision.reason}`)
}

function printScenarioMatrix(results: SlotResult[]): void {
  const headers = [
    'scenario',
    'mode',
    'payloadId',
    'builderFetchAt',
    'observedByPtcAt',
    'newPayloadStatus',
    'payloadDisposition',
    'canonicalHead'
  ]
  const rows = results.map((result) => [
    result.scenario,
    result.mode,
    result.payloadId,
    result.payload?.broadcastAtMs ?? 'withheld',
    result.forkChoiceState.payloadObservedByPtcAt ?? 'none',
    result.newPayloadStatus ?? 'none',
    result.payloadDisposition,
    result.canonicalHead
  ])
  printFixedWidthTable(headers, rows)
}

async function sweepBuilderFetchTimes(mode: SimulationMode): Promise<SweepPoint[]> {
  const timing = mode === 'didactic' ? DIDACTIC_TIMING : SPECISH_TIMING
  const builderFetchTimes: Array<number | null> = [null]
  for (let t = 0; t <= timing.slotMs; t += 1_000) builderFetchTimes.push(t)
  for (const edge of [timing.aggregateMs - 1, timing.aggregateMs, timing.ptcCutoffMs - 1, timing.ptcCutoffMs, timing.ptcCutoffMs + 1]) {
    if (!builderFetchTimes.includes(edge)) builderFetchTimes.push(edge)
  }
  builderFetchTimes.sort((left, right) => {
    if (left === null) return -1
    if (right === null) return 1
    return left - right
  })

  return runBuilderFetchSweep(
    builderFetchTimes,
    {
      builderValue: 1_000_000_000_000_000_000n,
      builderAction: 'reveal',
      mode
    },
    options.debugRpc ? { rpcLogger: (message) => console.log(message) } : {}
  )
}

function printSweepMarkdown(points: SweepPoint[]): void {
  console.log('| builderFetchAt | observedByPtcAt | newPayloadStatus | payloadDisposition | payloadStatus | ptcPresent | ptcAbsent | canonicalHead |')
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const point of points) {
    console.log(
      `| ${point.builderFetchAtMs ?? 'withheld'} | ${point.observedByPtcAt ?? 'none'} | ${point.newPayloadStatus ?? 'none'} | ${point.payloadDisposition} | ${point.payloadStatus} | ${point.ptcPresent} | ${point.ptcAbsent} | ${point.canonicalHead} |`
    )
  }
}

function printSweepCsv(points: SweepPoint[]): void {
  console.log('builderFetchAt,observedByPtcAt,newPayloadStatus,payloadDisposition,payloadStatus,ptcPresent,ptcAbsent,canonicalHead')
  for (const point of points) {
    console.log(
      `${point.builderFetchAtMs ?? 'withheld'},${point.observedByPtcAt ?? 'none'},${point.newPayloadStatus ?? 'none'},${point.payloadDisposition},${point.payloadStatus},${point.ptcPresent},${point.ptcAbsent},${point.canonicalHead}`
    )
  }
}

function printSweepMatrix(points: SweepPoint[]): void {
  const headers = [
    'builderFetchAt',
    'observedByPtcAt',
    'newPayloadStatus',
    'payloadDisposition',
    'payloadStatus',
    'ptcPresent',
    'ptcAbsent',
    'canonicalHead'
  ]
  const rows = points.map((point) => [
    point.builderFetchAtMs ?? 'withheld',
    point.observedByPtcAt ?? 'none',
    point.newPayloadStatus ?? 'none',
    point.payloadDisposition,
    point.payloadStatus,
    point.ptcPresent,
    point.ptcAbsent,
    point.canonicalHead
  ])
  printFixedWidthTable(headers, rows)
}

const options = parseArgs(process.argv.slice(2))

if (options.scenarioSet === 'sweep') {
  const points = await sweepBuilderFetchTimes(options.mode)
  if (options.format === 'csv') printSweepCsv(points)
  else if (options.format === 'markdown') printSweepMarkdown(points)
  else printSweepMatrix(points)
} else {
  const results = await runAllScenarios(
    options.mode,
    options.debugRpc ? { rpcLogger: (message) => console.log(message) } : {}
  )
  if (options.format === 'timeline') {
    for (const result of results) printScenario(result)
  } else {
    printScenarioMatrix(results)
  }
}
