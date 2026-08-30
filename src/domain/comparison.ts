import { ok, type DomainResult } from './result'
import { fingerprintWorkUnitSignature } from './fingerprints'
import type {
  ComparisonRule,
  ComparisonMeasure,
  DescriptiveComparison,
  DistributionSummary,
  RunMetricResult,
  RunRecord,
} from './schema'

export type ComparisonBlocker =
  | 'MISSING_BEFORE_RUNS'
  | 'MISSING_AFTER_RUNS'
  | 'INSUFFICIENT_RUNS_PER_PHASE'
  | 'MISSING_RUN_METRIC'
  | 'DUPLICATE_RUN'
  | 'DUPLICATE_RUN_METRIC'
  | 'DUPLICATE_METRIC_ID'
  | 'UNEXPECTED_RUN_METRIC'
  | 'METRIC_RUN_MISMATCH'
  | 'METRIC_PHASE_MISMATCH'
  | 'METRIC_SIGNATURE_MISMATCH'
  | 'METRIC_OBSERVABILITY_MISMATCH'
  | 'METRIC_TRACE_INCOMPLETE'
  | 'ZONE_REGISTRY_DRIFT'
  | 'INCOMPARABLE_RUN'
  | 'SIGNATURE_MISMATCH'
  | 'OBSERVABILITY_SHIFT'
  | 'GUARDRAIL_NOT_OK'
  | 'STALE_METRIC'

export interface BlockedComparison {
  readonly status: 'blocked'
  readonly comparisonRule: ComparisonRule
  readonly blockers: readonly ComparisonBlocker[]
  readonly affectedRunIds: readonly string[]
}

export interface ShownComparison {
  readonly status: 'shown'
  readonly comparison: DescriptiveComparison
}

export type ComparisonComputation = BlockedComparison | ShownComparison

export const CURRENT_COMPARISON_RULE: ComparisonRule = Object.freeze({
  id: 'multi-run-descriptive-comparison',
  version: '1.0.0',
  minimumRunsPerPhase: 3,
})

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  if (ordered.length % 2 === 1) return ordered[middle] ?? Number.NaN
  const left = ordered[middle - 1]
  const right = ordered[middle]
  return left === undefined || right === undefined
    ? Number.NaN
    : (left + right) / 2
}

function summarize(values: readonly number[]): DistributionSummary {
  return {
    values: [...values],
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function measure(
  beforeValues: readonly number[],
  afterValues: readonly number[],
): ComparisonMeasure {
  const before = summarize(beforeValues)
  const after = summarize(afterValues)
  return {
    before,
    after,
    signedDifference: after.median - before.median,
  }
}

export function compareRunMetrics(
  runs: readonly RunRecord[],
  metrics: readonly RunMetricResult[],
  comparisonId = 'comparison:before-after',
  comparisonRule: ComparisonRule = CURRENT_COMPARISON_RULE,
): DomainResult<ComparisonComputation> {
  const beforeRuns = runs.filter((run) => run.phase === 'before')
  const afterRuns = runs.filter((run) => run.phase === 'after')
  const blockers: ComparisonBlocker[] = []
  const affectedRunIds = new Set<string>()

  if (beforeRuns.length === 0) blockers.push('MISSING_BEFORE_RUNS')
  if (afterRuns.length === 0) blockers.push('MISSING_AFTER_RUNS')
  if (
    beforeRuns.length < comparisonRule.minimumRunsPerPhase ||
    afterRuns.length < comparisonRule.minimumRunsPerPhase
  ) {
    blockers.push('INSUFFICIENT_RUNS_PER_PHASE')
    runs.forEach((run) => affectedRunIds.add(run.id))
  }

  const runIds = runs.map((run) => run.id)
  if (new Set(runIds).size !== runIds.length) {
    blockers.push('DUPLICATE_RUN')
    runs.forEach((run) => affectedRunIds.add(run.id))
  }

  const metricByRun = new Map<string, RunMetricResult>()
  const metricIds = new Set<string>()
  for (const metric of metrics) {
    if (metricIds.has(metric.id)) {
      blockers.push('DUPLICATE_METRIC_ID')
      affectedRunIds.add(metric.runId)
    }
    metricIds.add(metric.id)
    if (!runIds.includes(metric.runId)) {
      blockers.push('UNEXPECTED_RUN_METRIC')
      affectedRunIds.add(metric.runId)
      continue
    }
    if (metricByRun.has(metric.runId)) {
      blockers.push('DUPLICATE_RUN_METRIC')
      affectedRunIds.add(metric.runId)
      continue
    }
    metricByRun.set(metric.runId, metric)
  }

  for (const run of runs) {
    const metric = metricByRun.get(run.id)
    if (metric === undefined) {
      blockers.push('MISSING_RUN_METRIC')
      affectedRunIds.add(run.id)
    } else if (metric.stale) {
      blockers.push('STALE_METRIC')
      affectedRunIds.add(run.id)
    }
    if (metric !== undefined) {
      if (
        metric.runId !== run.id ||
        metric.fixtureId !== run.source.fixtureId ||
        metric.assetId !== run.source.assetId
      ) {
        blockers.push('METRIC_RUN_MISMATCH')
        affectedRunIds.add(run.id)
      }
      if (metric.phase !== run.phase) {
        blockers.push('METRIC_PHASE_MISMATCH')
        affectedRunIds.add(run.id)
      }
      if (
        metric.signatureId !== run.signature.id ||
        metric.signatureFingerprint !== fingerprintWorkUnitSignature(run.signature)
      ) {
        blockers.push('METRIC_SIGNATURE_MISMATCH')
        affectedRunIds.add(run.id)
      }
      if (metric.observability !== run.observability) {
        blockers.push('METRIC_OBSERVABILITY_MISMATCH')
        affectedRunIds.add(run.id)
      }
      if (
        metric.trace.coverageId.trim().length === 0 ||
        metric.trace.ruleId.trim().length === 0 ||
        metric.trace.zoneRegistryId.trim().length === 0 ||
        metric.trace.zoneGeometryFingerprint.trim().length === 0 ||
        metric.trace.canonicalObservationIds.length !==
          metric.trace.activeRevisionIds.length
      ) {
        blockers.push('METRIC_TRACE_INCOMPLETE')
        affectedRunIds.add(run.id)
      }
    }
    if (run.comparability !== 'eligible') {
      blockers.push('INCOMPARABLE_RUN')
      affectedRunIds.add(run.id)
    }
    if (run.observability !== 'stable') {
      blockers.push('OBSERVABILITY_SHIFT')
      affectedRunIds.add(run.id)
    }
    if (
      run.guardrails.length === 0 ||
      run.guardrails.some(
        (guardrail) =>
          guardrail.id.trim().length === 0 ||
          guardrail.label.trim().length === 0 ||
          guardrail.note.trim().length === 0 ||
          !['ok', 'harm', 'unknown'].includes(guardrail.state) ||
          guardrail.state !== 'ok',
      )
    ) {
      blockers.push('GUARDRAIL_NOT_OK')
      affectedRunIds.add(run.id)
    }
  }

  const signatureFingerprints = new Set(
    runs.map((run) => fingerprintWorkUnitSignature(run.signature)),
  )
  if (signatureFingerprints.size > 1) {
    blockers.push('SIGNATURE_MISMATCH')
    runs.forEach((run) => affectedRunIds.add(run.id))
  }
  const zoneRegistryFingerprints = new Set(
    metrics.map(
      (metric) =>
        `${metric.trace.zoneRegistryId}:${metric.trace.zoneRegistryVersion}:${metric.trace.zoneGeometryFingerprint}`,
    ),
  )
  if (zoneRegistryFingerprints.size > 1) {
    blockers.push('ZONE_REGISTRY_DRIFT')
    runs.forEach((run) => affectedRunIds.add(run.id))
  }

  if (blockers.length > 0) {
    return ok({
      status: 'blocked',
      comparisonRule,
      blockers: [...new Set(blockers)],
      affectedRunIds: [...affectedRunIds],
    })
  }

  const beforeMetrics = beforeRuns
    .map((run) => metricByRun.get(run.id))
    .filter((metric): metric is RunMetricResult => metric !== undefined)
  const afterMetrics = afterRuns
    .map((run) => metricByRun.get(run.id))
    .filter((metric): metric is RunMetricResult => metric !== undefined)

  const guardrailNotes = runs.flatMap((run) =>
    run.guardrails.map((guardrail) => `${run.label}: ${guardrail.note}`),
  )

  return ok({
    status: 'shown',
    comparison: {
      id: comparisonId,
      comparisonRule,
      beforeRunIds: beforeRuns.map((run) => run.id),
      afterRunIds: afterRuns.map((run) => run.id),
      includedMetrics: [...beforeMetrics, ...afterMetrics].map((metric) => ({
        metricId: metric.id,
        runId: metric.runId,
        fixtureId: metric.fixtureId,
        assetId: metric.assetId,
        phase: metric.phase,
        signatureId: metric.signatureId,
        signatureFingerprint: metric.signatureFingerprint,
        canonicalObservationIds: metric.trace.canonicalObservationIds,
        activeRevisionIds: metric.trace.activeRevisionIds,
        coverageId: metric.trace.coverageId,
        coverageVersion: metric.trace.coverageVersion,
        ruleId: metric.trace.ruleId,
        ruleVersion: metric.trace.ruleVersion,
        zoneRegistryId: metric.trace.zoneRegistryId,
        zoneRegistryVersion: metric.trace.zoneRegistryVersion,
        zoneGeometryFingerprint: metric.trace.zoneGeometryFingerprint,
      })),
      presenceCount: measure(
        beforeMetrics.map((metric) => metric.presenceCount),
        afterMetrics.map((metric) => metric.presenceCount),
      ),
      confirmedDurationMs: measure(
        beforeMetrics.map((metric) => metric.confirmedDurationMs),
        afterMetrics.map((metric) => metric.confirmedDurationMs),
      ),
      transitionCount: measure(
        beforeMetrics.map((metric) => metric.transitionCount),
        afterMetrics.map((metric) => metric.transitionCount),
      ),
      attribution: 'not-established',
      alternativeExplanations: [
        'practice',
        'observation effect',
        'task or input variation',
        'observability difference',
      ],
      guardrailNotes,
    },
  })
}
