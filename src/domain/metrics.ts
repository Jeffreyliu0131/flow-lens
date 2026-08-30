import { evaluateCoverage, type CoverageBlocker } from './coverage'
import { fingerprintWorkUnitSignature } from './fingerprints'
import { validateObservationPayload } from './invariants'
import { err, ok, type DomainResult } from './result'
import type {
  CanonicalObservation,
  ReviewCoverage,
  RulePackage,
  RunMetricResult,
  RunRecord,
  VersionedZoneRegistry,
} from './schema'
import { createVersionedZoneRegistry } from './zones'

export const PRESENCE_RULE: RulePackage = {
  id: 'hand-zone-presence-summary',
  version: '1.0.0',
  description:
    'Count and duration of finalized low-level hand-zone presence intervals, plus discrete zone transitions.',
}

export type MetricBlocker =
  | CoverageBlocker
  | 'RUN_COVERAGE_MISMATCH'
  | 'RUN_SOURCE_INVALID'
  | 'ZONE_REGISTRY_MISMATCH'
  | 'COVERAGE_ZONE_REGISTRY_MISMATCH'
  | 'CROSS_RUN_OBSERVATION'
  | 'CROSS_FIXTURE_OBSERVATION'
  | 'CROSS_ASSET_OBSERVATION'
  | 'OBSERVATION_OUTSIDE_RUN'
  | 'INVALID_OBSERVATION_PAYLOAD'
  | 'UNKNOWN_ZONE'
  | 'DUPLICATE_OBSERVATION'
  | 'NON_CANONICAL_STATE'
  | 'MISSING_ACTIVE_REVISION'
  | 'OVERLAPPING_CANONICAL_EVENTS'
  | 'UNSUPPORTED_OBSERVATION_TYPE'
  | 'SYNTHETIC_SOURCE_LABEL_MISMATCH'
  | 'WORKSPACE_FIXTURE_INTEGRITY_MISMATCH'

export interface BlockedMetricResult {
  readonly status: 'blocked'
  readonly runId: string
  readonly blockers: readonly MetricBlocker[]
}

export interface ComputedMetricResult {
  readonly status: 'computed'
  readonly metric: RunMetricResult
}

export type RunMetricComputation = BlockedMetricResult | ComputedMetricResult

function overlaps(
  left: CanonicalObservation,
  right: CanonicalObservation,
): boolean {
  return left.payload.source.endMs > right.payload.source.startMs
}

export function computeRunMetric(
  run: RunRecord,
  observations: readonly CanonicalObservation[],
  coverage: ReviewCoverage,
  zoneRegistry: VersionedZoneRegistry,
  rule: RulePackage = PRESENCE_RULE,
): DomainResult<RunMetricComputation> {
  if (coverage.runId !== run.id || coverage.runDurationMs !== run.durationMs) {
    return ok({
      status: 'blocked',
      runId: run.id,
      blockers: ['RUN_COVERAGE_MISMATCH'],
    })
  }

  const registryValidation = createVersionedZoneRegistry(zoneRegistry)
  if (
    !registryValidation.ok ||
    registryValidation.value.geometryFingerprint !==
      zoneRegistry.geometryFingerprint ||
    zoneRegistry.fixtureId !== run.source.fixtureId
  ) {
    return ok({
      status: 'blocked',
      runId: run.id,
      blockers: ['ZONE_REGISTRY_MISMATCH'],
    })
  }
  if (coverage.zoneGeometryFingerprint !== zoneRegistry.geometryFingerprint) {
    return ok({
      status: 'blocked',
      runId: run.id,
      blockers: ['COVERAGE_ZONE_REGISTRY_MISMATCH'],
    })
  }
  if (
    !Number.isFinite(run.durationMs) ||
    run.durationMs <= 0 ||
    run.source.fixtureId.trim().length === 0 ||
    run.source.assetId.trim().length === 0 ||
    run.source.runId !== run.id ||
    !Number.isFinite(run.source.startMs) ||
    !Number.isFinite(run.source.endMs) ||
    run.source.startMs !== 0 ||
    run.source.endMs !== run.durationMs
  ) {
    return ok({
      status: 'blocked',
      runId: run.id,
      blockers: ['RUN_SOURCE_INVALID'],
    })
  }

  const coverageResult = evaluateCoverage(coverage)
  if (!coverageResult.ok) {
    return err(coverageResult.error.code, coverageResult.error.message)
  }
  if (coverageResult.value.status !== 'full') {
    return ok({
      status: 'blocked',
      runId: run.id,
      blockers: coverageResult.value.blockers,
    })
  }

  const blockers: MetricBlocker[] = []
  const ids = new Set<string>()
  const eligible = [...observations].sort(
    (left, right) =>
      left.payload.source.startMs - right.payload.source.startMs ||
      left.id.localeCompare(right.id),
  )

  for (const observation of eligible) {
    if (ids.has(observation.id)) blockers.push('DUPLICATE_OBSERVATION')
    ids.add(observation.id)
    if (
      observation.state !== 'confirmed' &&
      observation.state !== 'edited-final'
    ) {
      blockers.push('NON_CANONICAL_STATE')
    }
    if (observation.activeRevisionId.trim().length === 0) {
      blockers.push('MISSING_ACTIVE_REVISION')
    }
    const payloadValidation = validateObservationPayload(
      observation.payload,
      zoneRegistry,
    )
    if (!payloadValidation.ok) {
      blockers.push(
        payloadValidation.error.code === 'UNKNOWN_ZONE'
          ? 'UNKNOWN_ZONE'
          : 'INVALID_OBSERVATION_PAYLOAD',
      )
    }
    if (observation.payload.source.runId !== run.id) {
      blockers.push('CROSS_RUN_OBSERVATION')
    }
    if (observation.payload.source.fixtureId !== run.source.fixtureId) {
      blockers.push('CROSS_FIXTURE_OBSERVATION')
    }
    if (observation.payload.source.assetId !== run.source.assetId) {
      blockers.push('CROSS_ASSET_OBSERVATION')
    }
    if (
      !Number.isFinite(observation.payload.source.startMs) ||
      !Number.isFinite(observation.payload.source.endMs) ||
      observation.payload.source.startMs < 0 ||
      observation.payload.source.startMs >= observation.payload.source.endMs ||
      observation.payload.source.endMs > run.durationMs
    ) {
      blockers.push('OBSERVATION_OUTSIDE_RUN')
    }
    if (observation.payload.eventType !== 'HAND_ZONE_PRESENCE_INTERVAL') {
      blockers.push('UNSUPPORTED_OBSERVATION_TYPE')
    }
  }

  for (let index = 1; index < eligible.length; index += 1) {
    const previous = eligible[index - 1]
    const current = eligible[index]
    if (previous !== undefined && current !== undefined && overlaps(previous, current)) {
      blockers.push('OVERLAPPING_CANONICAL_EVENTS')
      break
    }
  }

  if (blockers.length > 0) {
    return ok({
      status: 'blocked',
      runId: run.id,
      blockers: [...new Set(blockers)],
    })
  }

  const confirmedDurationMs = eligible.reduce(
    (total, observation) =>
      total +
      observation.payload.source.endMs -
      observation.payload.source.startMs,
    0,
  )
  let transitionCount = 0
  for (let index = 1; index < eligible.length; index += 1) {
    const previous = eligible[index - 1]
    const current = eligible[index]
    if (
      previous !== undefined &&
      current !== undefined &&
      previous.payload.zoneId !== current.payload.zoneId
    ) {
      transitionCount += 1
    }
  }

  const canonicalObservationIds = eligible.map((observation) => observation.id)
  const activeRevisionIds = eligible.map(
    (observation) => observation.activeRevisionId,
  )

  return ok({
    status: 'computed',
    metric: {
      id: `${run.id}:${rule.id}:${coverage.id}:v${coverage.version}`,
      runId: run.id,
      fixtureId: run.source.fixtureId,
      assetId: run.source.assetId,
      phase: run.phase,
      signatureId: run.signature.id,
      signatureFingerprint: fingerprintWorkUnitSignature(run.signature),
      observability: run.observability,
      scope: 'full-run',
      presenceCount: eligible.length,
      confirmedDurationMs,
      transitionCount,
      trace: {
        canonicalObservationIds,
        activeRevisionIds,
        coverageId: coverage.id,
        coverageVersion: coverage.version,
        ruleId: rule.id,
        ruleVersion: rule.version,
        zoneRegistryId: zoneRegistry.id,
        zoneRegistryVersion: zoneRegistry.version,
        zoneGeometryFingerprint: zoneRegistry.geometryFingerprint,
      },
      stale: false,
    },
  })
}
