import {
  applySessionCommand,
  compareRunMetrics,
  computeRunMetric,
  createClaimPackage,
  createDomainSession,
  createVersionedZoneRegistry,
  getActiveRevision,
  listCanonicalObservations,
  type ClaimPackage,
  type DescriptiveComparison,
  type DomainSession,
  type EventKind,
  type FixtureBundle,
  type ReviewCoverage,
  type RunMetricResult,
  type RunRecord,
  type SessionCommand,
  type WorkUnitSignature,
  type ZoneDefinition,
} from '../domain'
import type { DomainResult } from '../domain/result'
import type {
  CandidateObservation,
  ObservationPayload,
  Phase,
} from '../domain/schema'
import type { SyntheticSourceDefinition } from './syntheticSource'

export type SyntheticScenarioId =
  | 'eligible'
  | 'coverage-gap'
  | 'incomparable'
  | 'observability-shift'
  | 'guardrail-harm'
  | 'source-mismatch'

export interface SyntheticScenario {
  readonly id: SyntheticScenarioId
  readonly label: string
  readonly fixture: FixtureBundle
  readonly session: DomainSession
  readonly metricResults: Readonly<Record<string, RunMetricResult>>
  readonly sources: Readonly<Record<string, SyntheticSourceDefinition>>
  readonly comparison:
    | { readonly status: 'shown'; readonly value: DescriptiveComparison; readonly claim: ClaimPackage }
    | { readonly status: 'blocked'; readonly blockers: readonly string[]; readonly affectedRunIds: readonly string[] }
}

export interface SyntheticWorkbench {
  readonly seed: string
  readonly defaultScenarioId: 'eligible'
  readonly scenarios: Readonly<Record<SyntheticScenarioId, SyntheticScenario>>
  readonly sources: Readonly<Record<string, SyntheticSourceDefinition>>
  readonly syntheticEvidenceOnly: true
}

function hashSeed(seed: string): number {
  let value = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function seededRandom(seed: string): () => number {
  let value = hashSeed(seed)
  return () => {
    value += 0x6d2b79f5
    let mixed = value
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

function requireValue<T>(result: DomainResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`)
  }
  return result.value
}

function apply(state: DomainSession, command: SessionCommand): DomainSession {
  return requireValue(applySessionCommand(state, command))
}

function sourceRef(
  fixtureId: string,
  runId: string,
  startMs: number,
  endMs: number,
): ObservationPayload['source'] {
  return {
    fixtureId,
    assetId: `synthetic:${runId}`,
    runId,
    startMs,
    endMs,
  }
}

function makeZones(): readonly ZoneDefinition[] {
  return [
    { id: 'zone-inbox', roleId: 'inbox', label: '物料', phaseGeometryVersion: 1, x: 4, y: 12, width: 24, height: 34 },
    { id: 'zone-box', roleId: 'box', label: '纸箱', phaseGeometryVersion: 1, x: 37, y: 18, width: 28, height: 46 },
    { id: 'zone-tape', roleId: 'tape', label: '胶带', phaseGeometryVersion: 1, x: 72, y: 12, width: 20, height: 24 },
    { id: 'zone-label', roleId: 'label', label: '标签', phaseGeometryVersion: 1, x: 72, y: 52, width: 20, height: 27 },
  ]
}

function makeZoneRegistry(fixtureId: string, version = 1) {
  return requireValue(
    createVersionedZoneRegistry({
      id: `zone-registry:${fixtureId}:v${version}`,
      fixtureId,
      version,
      zones: makeZones(),
    }),
  )
}

function makeSignature(id = 'signature:same-sku:v1'): WorkUnitSignature {
  return {
    id,
    skuAlias: 'SKU-合成-01',
    taskBoundary: '一个合成包裹，从空箱开始到封箱贴标完成',
    materials: ['纸箱', '商品', '纸胶带', '合成标签'],
    completionRule: '纸箱封闭且合成标签已贴好',
    version: 1,
  }
}

function makeRuns(fixtureId: string): readonly RunRecord[] {
  const signature = makeSignature()
  const phases: readonly Phase[] = ['before', 'before', 'before', 'after', 'after', 'after']
  return phases.map((phase, index) => {
    const ordinal = index % 3 + 1
    const id = `${phase}-${ordinal}`
    const durationMs = phase === 'before' ? 13_000 + ordinal * 500 : 11_000 + ordinal * 450
    return {
      id,
      label: `${phase === 'before' ? '基线' : '改后'} ${ordinal}`,
      phase,
      order: ordinal,
      durationMs,
      source: sourceRef(fixtureId, id, 0, durationMs),
      signature,
      comparability: 'eligible',
      observability: 'stable',
      guardrails: [
        {
          id: `${id}:quality`,
          label: '合成打包质量',
          state: 'ok',
          note: '合成 guardrail 未记录变化。',
        },
      ],
    }
  })
}

function fullCoverage(
  run: RunRecord,
  zoneGeometryFingerprint: string,
): ReviewCoverage {
  return {
    id: `coverage:${run.id}:v1`,
    runId: run.id,
    version: 1,
    runDurationMs: run.durationMs,
    reviewedIntervals: [{ startMs: 0, endMs: run.durationMs }],
    unknownIntervals: [],
    unreviewedIntervals: [],
    candidateIndependentSweep: true,
    finalized: true,
    zoneGeometryFingerprint,
  }
}

function makeCandidate(
  fixtureId: string,
  runId: string,
  id: string,
  zoneId: string,
  startMs: number,
  durationMs = 360,
  confidence?: number,
  eventKind: EventKind = 'zone-entry',
): CandidateObservation {
  const candidate: {
    id: string
    payload: ObservationPayload
    producer: 'synthetic'
    confidence?: number
    state: 'proposed'
  } = {
    id,
    payload: {
      source: sourceRef(fixtureId, runId, startMs, startMs + durationMs),
      zoneId,
      eventType: 'HAND_ZONE_PRESENCE_INTERVAL',
      eventKind,
    },
    producer: 'synthetic',
    state: 'proposed',
  }
  if (confidence !== undefined) candidate.confidence = confidence
  return candidate
}

function buildSession(
  fixtureId: string,
  zoneRegistry: FixtureBundle['zoneRegistry'],
  runs: readonly RunRecord[],
  random: () => number,
): DomainSession {
  let state = createDomainSession(fixtureId, zoneRegistry)
  const beforeCounts = [5, 6, 5]
  const afterCounts = [3, 4, 3]
  const zoneSequence = ['zone-inbox', 'zone-box', 'zone-tape', 'zone-box', 'zone-label', 'zone-box']
  let revisionIndex = 0

  for (const run of runs) {
    const count = run.phase === 'before'
      ? beforeCounts[run.order - 1]
      : afterCounts[run.order - 1]
    if (count === undefined) throw new Error('Synthetic run order is invalid')
    for (let eventIndex = 0; eventIndex < count; eventIndex += 1) {
      const jitter = Math.floor(random() * 80)
      const startMs = 700 + eventIndex * 1_550 + jitter
      const zoneId = zoneSequence[eventIndex % zoneSequence.length]
      if (zoneId === undefined) throw new Error('Synthetic zone sequence is invalid')
      const candidate = makeCandidate(
        fixtureId,
        run.id,
        `${run.id}:event-${eventIndex + 1}`,
        zoneId,
        startMs,
        360,
        undefined,
        (['zone-entry', 'zone-dwell', 'zone-revisit'] as const)[
          eventIndex % 3
        ],
      )
      state = apply(state, { type: 'register-candidate', candidate })
      revisionIndex += 1
      state = apply(state, {
        type: 'confirm-observation',
        observationId: candidate.id,
        id: `revision:${revisionIndex}`,
        actorId: 'synthetic-reviewer',
        atMs: revisionIndex,
      })
    }
  }

  const lowConfidence = makeCandidate(
    fixtureId,
    'before-1',
    'before-1:low-confidence',
    'zone-tape',
    10_200,
    280,
    0.31,
    'zone-dwell',
  )
  state = apply(state, { type: 'register-candidate', candidate: lowConfidence })

  const rejected = makeCandidate(
    fixtureId,
    'before-2',
    'before-2:rejected',
    'zone-label',
    10_500,
    360,
    undefined,
    'zone-entry',
  )
  state = apply(state, { type: 'register-candidate', candidate: rejected })
  state = apply(state, {
    type: 'reject-observation',
    observationId: rejected.id,
    id: 'revision:rejected',
    actorId: 'synthetic-reviewer',
    atMs: 9_001,
    reason: '合成错误候选',
  })

  const uncertain = makeCandidate(
    fixtureId,
    'after-1',
    'after-1:uncertain',
    'zone-box',
    9_200,
    360,
    undefined,
    'zone-revisit',
  )
  state = apply(state, { type: 'register-candidate', candidate: uncertain })
  state = apply(state, {
    type: 'mark-uncertain',
    observationId: uncertain.id,
    id: 'revision:uncertain',
    actorId: 'synthetic-reviewer',
    atMs: 9_002,
    reason: '合成遮挡区间',
  })

  return state
}

interface PlannedSourceInterval {
  readonly startMs: number
  readonly endMs: number
  readonly zoneId: string
}

function makeIndependentSourcePlans(
  runs: readonly RunRecord[],
  seed: string,
): Readonly<Record<string, readonly PlannedSourceInterval[]>> {
  const random = seededRandom(`${seed}:source-schedule`)
  const beforeCounts = [5, 6, 5]
  const afterCounts = [3, 4, 3]
  const zoneSequence = ['zone-inbox', 'zone-box', 'zone-tape', 'zone-box', 'zone-label', 'zone-box']
  return Object.fromEntries(
    runs.map((run) => {
      const count = run.phase === 'before'
        ? beforeCounts[run.order - 1]
        : afterCounts[run.order - 1]
      if (count === undefined) throw new Error('Synthetic source plan is invalid')
      const intervals = Array.from({ length: count }, (_, index) => {
        const zoneId = zoneSequence[index % zoneSequence.length]
        if (zoneId === undefined) throw new Error('Synthetic source zone is invalid')
        const startMs = 600 + index * 1_550 + Math.floor(random() * 30)
        return { startMs, endMs: startMs + 820, zoneId }
      })
      if (run.id === 'before-1') {
        intervals.push({
          startMs: 10_100,
          endMs: 10_600,
          zoneId: 'zone-tape',
        })
      }
      return [run.id, intervals]
    }),
  )
}

function makeSources(
  runs: readonly RunRecord[],
  zones: readonly ZoneDefinition[],
  sourcePlans: Readonly<Record<string, readonly PlannedSourceInterval[]>>,
): Readonly<Record<string, SyntheticSourceDefinition>> {
  return Object.fromEntries(
    runs.map((run) => {
      const intervals = sourcePlans[run.id] ?? []
      const keyframes = [
        { atMs: 0, x: 48, y: 52, parcelProgress: 0 },
        ...intervals.map((interval, index) => {
          const zone = zones.find((candidate) => candidate.id === interval.zoneId)
          return {
            atMs: interval.startMs,
            x: zone === undefined ? 50 : zone.x + zone.width / 2,
            y: zone === undefined ? 50 : zone.y + zone.height / 2,
            activeZoneId: interval.zoneId,
            parcelProgress: (index + 1) / Math.max(1, intervals.length + 1),
          }
        }),
        { atMs: run.durationMs, x: 50, y: 56, parcelProgress: 1 },
      ]
      return [
        run.id,
        {
          id: `synthetic-source:${run.id}`,
          fixtureId: run.source.fixtureId,
          assetId: run.source.assetId,
          runId: run.id,
          phase: run.phase,
          durationMs: run.durationMs,
          width: 100,
          height: 100,
          zones,
          keyframes,
          evidenceIntervals: intervals.map((interval) => ({
            startMs: interval.startMs,
            endMs: interval.endMs,
            activeZoneId: interval.zoneId,
          })),
        },
      ]
    }),
  )
}

export interface SyntheticSourceMismatch {
  readonly observationId: string
  readonly runId: string
  readonly reason:
    | 'SOURCE_MISSING'
    | 'SOURCE_IDENTITY_MISMATCH'
    | 'SOURCE_INTERVAL_INVALID'
    | 'OBSERVATION_RANGE_NOT_COVERED'
    | 'OBSERVATION_ZONE_MISMATCH'
  readonly expectedZoneId?: string
  readonly reviewedZoneId?: string
}

export function findSyntheticSourceMismatches(
  session: DomainSession,
  fixture: FixtureBundle,
  sources: Readonly<Record<string, SyntheticSourceDefinition>>,
): readonly SyntheticSourceMismatch[] {
  const runById = new Map(fixture.runs.map((run) => [run.id, run]))
  const validSources = new Set<string>()
  const sourceMismatches = fixture.runs.flatMap((run): SyntheticSourceMismatch[] => {
    const source = sources[run.id]
    if (source === undefined) {
      return [{
        observationId: `source:${run.id}`,
        runId: run.id,
        reason: 'SOURCE_MISSING',
      }]
    }
    if (
      source.fixtureId !== fixture.manifest.fixtureId ||
      source.fixtureId !== run.source.fixtureId ||
      source.assetId !== run.source.assetId ||
      source.runId !== run.id ||
      source.phase !== run.phase ||
      source.durationMs !== run.durationMs
    ) {
      return [{
        observationId: `source:${run.id}`,
        runId: run.id,
        reason: 'SOURCE_IDENTITY_MISMATCH',
      }]
    }
    const zoneIds = new Set(fixture.zoneRegistry.zones.map((zone) => zone.id))
    const intervals = [...source.evidenceIntervals].sort(
      (left, right) => left.startMs - right.startMs || left.endMs - right.endMs,
    )
    const invalidInterval = intervals.some((interval, index) => {
      const prior = intervals[index - 1]
      return (
        !Number.isFinite(interval.startMs) ||
        !Number.isFinite(interval.endMs) ||
        interval.startMs < 0 ||
        interval.startMs >= interval.endMs ||
        interval.endMs > source.durationMs ||
        !zoneIds.has(interval.activeZoneId) ||
        (prior !== undefined && interval.startMs < prior.endMs)
      )
    })
    if (invalidInterval) {
      return [{
        observationId: `source:${run.id}`,
        runId: run.id,
        reason: 'SOURCE_INTERVAL_INVALID',
      }]
    }
    validSources.add(run.id)
    return []
  })

  const observationMismatches = listCanonicalObservations(session.observations).flatMap((observation) => {
    const run = runById.get(observation.payload.source.runId)
    const source = sources[observation.payload.source.runId]
    if (run === undefined || source === undefined || !validSources.has(run.id)) return []
    if (
      observation.payload.source.fixtureId !== run.source.fixtureId ||
      observation.payload.source.assetId !== run.source.assetId
    ) {
      return [{
        observationId: observation.id,
        runId: observation.payload.source.runId,
        reason: 'SOURCE_IDENTITY_MISMATCH' as const,
        reviewedZoneId: observation.payload.zoneId,
      }]
    }
    const coveringInterval = source.evidenceIntervals.find(
      (interval) =>
        interval.startMs <= observation.payload.source.startMs &&
        observation.payload.source.endMs <= interval.endMs,
    )
    if (coveringInterval?.activeZoneId === observation.payload.zoneId) return []
    const mismatch: SyntheticSourceMismatch = {
      observationId: observation.id,
      runId: observation.payload.source.runId,
      reason: coveringInterval === undefined
        ? 'OBSERVATION_RANGE_NOT_COVERED'
        : 'OBSERVATION_ZONE_MISMATCH',
      reviewedZoneId: observation.payload.zoneId,
    }
    return coveringInterval === undefined
      ? [mismatch]
      : [{ ...mismatch, expectedZoneId: coveringInterval.activeZoneId }]
  })
  return [...sourceMismatches, ...observationMismatches]
}

function withSourceMismatch(session: DomainSession): DomainSession {
  const record = Object.values(session.observations).find(
    (candidate) => getActiveRevision(candidate)?.resultingState === 'confirmed',
  )
  const active = record === undefined ? undefined : getActiveRevision(record)
  if (record === undefined || active?.payload === undefined) {
    throw new Error('Synthetic source mismatch needs canonical evidence')
  }
  const alternativeZone = session.zoneRegistry.zones.find(
    (zone) => zone.id !== active.payload?.zoneId,
  )
  if (alternativeZone === undefined) throw new Error('Synthetic alternative zone missing')
  let next = apply(session, {
    type: 'start-edit',
    observationId: record.candidate.id,
    id: 'source-mismatch:draft',
    actorId: 'synthetic-reviewer',
    atMs: 11_000,
  })
  next = apply(next, {
    type: 'update-edit',
    observationId: record.candidate.id,
    id: 'source-mismatch:update',
    actorId: 'synthetic-reviewer',
    atMs: 11_001,
    payload: { ...active.payload, zoneId: alternativeZone.id },
  })
  return apply(next, {
    type: 'finalize-edit',
    observationId: record.candidate.id,
    id: 'source-mismatch:final',
    actorId: 'synthetic-reviewer',
    atMs: 11_002,
  })
}

function withRun(
  runs: readonly RunRecord[],
  runId: string,
  transform: (run: RunRecord) => RunRecord,
): readonly RunRecord[] {
  return runs.map((run) => (run.id === runId ? transform(run) : run))
}

function makeScenario(
  id: SyntheticScenarioId,
  label: string,
  fixture: FixtureBundle,
  session: DomainSession,
  sources: Readonly<Record<string, SyntheticSourceDefinition>>,
): SyntheticScenario {
  const canonicals = listCanonicalObservations(session.observations)
  const metricResults: Record<string, RunMetricResult> = {}
  const metricBlockers: string[] = []
  const sourceMismatches = findSyntheticSourceMismatches(
    session,
    fixture,
    sources,
  )
  if (sourceMismatches.length > 0) {
    return {
      id,
      label,
      fixture,
      session,
      metricResults,
      sources,
      comparison: {
        status: 'blocked',
        blockers: ['SYNTHETIC_SOURCE_LABEL_MISMATCH'],
        affectedRunIds: [
          ...new Set(sourceMismatches.map((mismatch) => mismatch.runId)),
        ],
      },
    }
  }
  for (const run of fixture.runs) {
    const coverage = fixture.coverages[run.id]
    if (coverage === undefined) {
      metricBlockers.push('MISSING_RUN_COVERAGE')
      continue
    }
    const metricResult = requireValue(
      computeRunMetric(
        run,
        canonicals.filter(
          (observation) => observation.payload.source.runId === run.id,
        ),
        coverage,
        session.zoneRegistry,
      ),
    )
    if (metricResult.status === 'blocked') {
      metricBlockers.push(...metricResult.blockers)
    } else {
      metricResults[run.id] = metricResult.metric
    }
  }

  const comparisonResult = requireValue(
    compareRunMetrics(fixture.runs, Object.values(metricResults)),
  )
  if (comparisonResult.status === 'blocked' || metricBlockers.length > 0) {
    const blockers = comparisonResult.status === 'blocked'
      ? [...metricBlockers, ...comparisonResult.blockers]
      : metricBlockers
    return {
      id,
      label,
      fixture,
      session,
      metricResults,
      sources,
      comparison: {
        status: 'blocked',
        blockers: [...new Set(blockers)],
        affectedRunIds:
          comparisonResult.status === 'blocked'
            ? comparisonResult.affectedRunIds
            : [],
      },
    }
  }

  const claim = requireValue(
    createClaimPackage(
      comparisonResult.comparison,
      fixture.manifest.provenance,
    ),
  )
  return {
    id,
    label,
    fixture,
    session,
    metricResults,
    sources,
    comparison: {
      status: 'shown',
      value: comparisonResult.comparison,
      claim,
    },
  }
}

export function createSyntheticWorkbench(
  seed = 'flow-lens-portfolio-v1',
): SyntheticWorkbench {
  const fixtureId = `fixture:${hashSeed(seed).toString(16)}`
  const zoneRegistry = makeZoneRegistry(fixtureId)
  const zones = zoneRegistry.zones
  const runs = makeRuns(fixtureId)
  const coverages = Object.fromEntries(
    runs.map((run) => [run.id, fullCoverage(run, zoneRegistry.geometryFingerprint)]),
  )
  const baseFixture: FixtureBundle = {
    manifest: {
      schemaVersion: 1,
      fixtureId,
      seed,
      title: '固定工位同一 SKU 合成打包演示',
      provenance: 'synthetic',
      sourceNote: '程序化生成，不是真实工作流证据。',
      privateDataForbidden: true,
    },
    zoneRegistry,
    runs,
    coverages,
  }
  const session = buildSession(
    fixtureId,
    zoneRegistry,
    runs,
    seededRandom(`${seed}:review-labels`),
  )
  const sources = makeSources(
    runs,
    zones,
    makeIndependentSourcePlans(runs, seed),
  )

  const coverageGapRun = runs.find((run) => run.id === 'after-3')
  if (coverageGapRun === undefined) throw new Error('Synthetic fixture is incomplete')
  const coverageGapFixture: FixtureBundle = {
    ...baseFixture,
    coverages: {
      ...coverages,
      'after-3': {
        ...fullCoverage(coverageGapRun, zoneRegistry.geometryFingerprint),
        id: 'coverage:after-3:gap',
        version: 2,
        reviewedIntervals: [{ startMs: 0, endMs: 6_000 }],
        unknownIntervals: [{ startMs: 6_000, endMs: 7_000 }],
        unreviewedIntervals: [
          { startMs: 7_000, endMs: coverageGapRun.durationMs },
        ],
      },
    },
  }
  const incomparableFixture: FixtureBundle = {
    ...baseFixture,
    runs: withRun(runs, 'after-3', (run) => ({
      ...run,
      signature: makeSignature('signature:different-materials:v2'),
      comparability: 'incomparable',
      incomparableReason: '合成材料与工作单元签名不同',
    })),
  }
  const observabilityFixture: FixtureBundle = {
    ...baseFixture,
    runs: withRun(runs, 'after-2', (run) => ({
      ...run,
      observability: 'shifted',
    })),
  }
  const guardrailFixture: FixtureBundle = {
    ...baseFixture,
    runs: withRun(runs, 'after-2', (run) => ({
      ...run,
      guardrails: run.guardrails.map((guardrail) => ({
        ...guardrail,
        state: 'harm' as const,
        note: '合成质量 guardrail 记录为 harm，阻断价值与决定。',
      })),
    })),
  }
  const mismatchSession = withSourceMismatch(session)

  const scenarios: Readonly<Record<SyntheticScenarioId, SyntheticScenario>> = {
    eligible: makeScenario('eligible', '可计算描述性对比', baseFixture, session, sources),
    'coverage-gap': makeScenario('coverage-gap', '覆盖缺口阻断全程指标', coverageGapFixture, session, sources),
    incomparable: makeScenario('incomparable', '工作单元签名不一致', incomparableFixture, session, sources),
    'observability-shift': makeScenario('observability-shift', '可见性变化阻断对比', observabilityFixture, session, sources),
    'guardrail-harm': makeScenario('guardrail-harm', '质量 guardrail 阻断对比', guardrailFixture, session, sources),
    'source-mismatch': makeScenario('source-mismatch', '独立 source 与复核标签不一致', baseFixture, mismatchSession, sources),
  }

  return {
    seed,
    defaultScenarioId: 'eligible',
    scenarios,
    sources,
    syntheticEvidenceOnly: true,
  }
}
