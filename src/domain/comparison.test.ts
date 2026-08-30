import { describe, expect, it } from 'vitest'
import {
  compareRunMetrics,
  CURRENT_COMPARISON_RULE,
} from './comparison'
import { createClaimPackage } from './claims'
import { fingerprintWorkUnitSignature } from './fingerprints'
import type {
  RunMetricResult,
  RunRecord,
  WorkUnitSignature,
} from './schema'

const signature: WorkUnitSignature = {
  id: 'sig-1',
  skuAlias: 'SKU',
  taskBoundary: 'one parcel',
  materials: ['box'],
  completionRule: 'closed',
  version: 1,
}

function run(id: string, phase: 'before' | 'after', order: number): RunRecord {
  return {
    id,
    label: id,
    phase,
    order,
    durationMs: 1_000,
    source: {
      fixtureId: 'fixture',
      assetId: `asset:${id}`,
      runId: id,
      startMs: 0,
      endMs: 1_000,
    },
    signature,
    comparability: 'eligible',
    observability: 'stable',
    guardrails: [
      { id: `${id}:g`, label: 'Quality', state: 'ok', note: 'No change.' },
    ],
  }
}

function metric(
  record: RunRecord,
  presenceCount: number,
): RunMetricResult {
  const canonicalObservationIds = Array.from(
    { length: presenceCount },
    (_, index) => `${record.id}:event-${index + 1}`,
  )
  return {
    id: `metric:${record.id}`,
    runId: record.id,
    fixtureId: record.source.fixtureId,
    assetId: record.source.assetId,
    phase: record.phase,
    signatureId: record.signature.id,
    signatureFingerprint: fingerprintWorkUnitSignature(record.signature),
    observability: record.observability,
    scope: 'full-run',
    presenceCount,
    confirmedDurationMs: presenceCount * 100,
    transitionCount: Math.max(0, presenceCount - 1),
    trace: {
      canonicalObservationIds,
      activeRevisionIds: canonicalObservationIds.map(
        (observationId) => `${observationId}:revision`,
      ),
      coverageId: `coverage:${record.id}`,
      coverageVersion: 1,
      ruleId: 'rule',
      ruleVersion: '1',
      zoneRegistryId: 'zones:v1',
      zoneRegistryVersion: 1,
      zoneGeometryFingerprint: 'zone-fingerprint-v1',
    },
    stale: false,
  }
}

describe('multi-run descriptive comparison', () => {
  it('uses medians and produces a descriptive ClaimPackage', () => {
    const runs = [
      run('before-1', 'before', 1),
      run('before-2', 'before', 2),
      run('before-3', 'before', 3),
      run('after-1', 'after', 1),
      run('after-2', 'after', 2),
      run('after-3', 'after', 3),
    ]
    const metrics = runs.map((record, index) =>
      metric(record, index < 3 ? [5, 6, 5][index]! : [3, 4, 3][index - 3]!),
    )
    const result = compareRunMetrics(runs, metrics)
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'shown') return
    expect(result.value.comparison.presenceCount.before.median).toBe(5)
    expect(result.value.comparison.presenceCount.after.median).toBe(3)
    expect(result.value.comparison.presenceCount.signedDifference).toBe(-2)
    expect(result.value.comparison.comparisonRule).toEqual(
      CURRENT_COMPARISON_RULE,
    )
    expect(result.value.comparison.includedMetrics).toHaveLength(6)
    const claim = createClaimPackage(result.value.comparison, 'synthetic')
    expect(claim.ok && claim.value.syntheticEvidenceOnly).toBe(true)
    expect(claim.ok && claim.value.kind).toBe('DESCRIPTIVE_COMPARISON')
    expect(claim.ok && claim.value.provenance).toBe('synthetic')
    expect(claim.ok && claim.value.caveat).toContain('not established')
    expect(claim.ok && claim.value.includedEvidenceFingerprint).toMatch(
      /^[0-9a-f]{8}$/,
    )
    if (claim.ok) {
      expect(
        claim.value.comparison.includedMetrics.map((evidence) => evidence.metricId),
      ).toEqual(metrics.map((value) => value.id))
      expect(claim.value.comparison.includedMetrics[0]).toMatchObject({
        coverageId: 'coverage:before-1',
        ruleId: 'rule',
        zoneRegistryId: 'zones:v1',
      })
      expect(
        claim.value.comparison.includedMetrics[0]?.canonicalObservationIds,
      ).toHaveLength(5)
    }

    const incompleteClaim = createClaimPackage(
      {
        ...result.value.comparison,
        includedMetrics: result.value.comparison.includedMetrics.slice(1),
      },
      'synthetic',
    )
    expect(incompleteClaim.ok).toBe(false)
    const forgedProvenance = createClaimPackage(
      result.value.comparison,
      'trusted-by-name' as never,
    )
    expect(forgedProvenance).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PROVENANCE' },
    })
  })

  it('blocks an otherwise eligible 1 + 1 comparison under the current rule', () => {
    const before = run('before-1', 'before', 1)
    const after = run('after-1', 'after', 1)
    const result = compareRunMetrics(
      [before, after],
      [metric(before, 5), metric(after, 3)],
    )
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'blocked') return
    expect(result.value.blockers).toContain('INSUFFICIENT_RUNS_PER_PHASE')
    expect(result.value.comparisonRule).toEqual(CURRENT_COMPARISON_RULE)
    expect(result.value.affectedRunIds).toEqual(['before-1', 'after-1'])
  })

  it('preserves exact non-synthetic provenance without elevating it', () => {
    const runs = [
      run('before-1', 'before', 1),
      run('before-2', 'before', 2),
      run('before-3', 'before', 3),
      run('after-1', 'after', 1),
      run('after-2', 'after', 2),
      run('after-3', 'after', 3),
    ]
    const result = compareRunMetrics(
      runs,
      runs.map((record) => metric(record, 3)),
    )
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'shown') return
    const claim = createClaimPackage(
      result.value.comparison,
      'user-asserted-unverified',
    )
    expect(claim.ok).toBe(true)
    if (!claim.ok) return
    expect(claim.value.kind).toBe('DESCRIPTIVE_COMPARISON')
    expect(claim.value.provenance).toBe('user-asserted-unverified')
    expect(claim.value.provenance).not.toBe('project-owned')
    expect(claim.value.syntheticEvidenceOnly).toBe(false)
    expect(claim.value.caveat).toContain('user-asserted and unverified')
  })

  it('blocks observability shifts without treating an ID-only signature change as drift', () => {
    const before = run('before-1', 'before', 1)
    const after = {
      ...run('after-1', 'after', 1),
      observability: 'shifted' as const,
      signature: { ...signature, id: 'sig-2' },
    }
    const result = compareRunMetrics(
      [before, after],
      [metric(before, 5), metric(after, 3)],
    )
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'blocked') return
    expect(result.value.blockers).not.toContain('SIGNATURE_MISMATCH')
    expect(result.value.blockers).toContain('OBSERVABILITY_SHIFT')
    expect(result.value.affectedRunIds).toEqual(
      expect.arrayContaining(['before-1', 'after-1']),
    )
  })

  it('blocks duplicate and mismatched metric evidence', () => {
    const before = run('before-1', 'before', 1)
    const after = run('after-1', 'after', 1)
    const duplicate = metric(before, 5)
    const mismatched = {
      ...metric(after, 3),
      phase: 'before' as const,
      signatureFingerprint: 'forged-signature',
      observability: 'shifted' as const,
    }
    const result = compareRunMetrics(
      [before, after],
      [
        duplicate,
        { ...duplicate, id: 'metric:duplicate-run' },
        { ...mismatched, id: duplicate.id },
      ],
    )
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'blocked') return
    expect(result.value.blockers).toContain('DUPLICATE_RUN_METRIC')
    expect(result.value.blockers).toContain('DUPLICATE_METRIC_ID')
    expect(result.value.blockers).toContain('METRIC_PHASE_MISMATCH')
    expect(result.value.blockers).toContain('METRIC_SIGNATURE_MISMATCH')
    expect(result.value.blockers).toContain('METRIC_OBSERVABILITY_MISMATCH')
  })

  it('fingerprints signature contents even when IDs are unchanged', () => {
    const before = run('before-1', 'before', 1)
    const after = {
      ...run('after-1', 'after', 1),
      signature: { ...signature, materials: ['different material'] },
    }
    const result = compareRunMetrics(
      [before, after],
      [metric(before, 5), metric(after, 3)],
    )
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'blocked') return
    expect(result.value.blockers).toContain('SIGNATURE_MISMATCH')
  })

  it('blocks metrics computed against different zone registries', () => {
    const before = run('before-1', 'before', 1)
    const after = run('after-1', 'after', 1)
    const afterMetric = metric(after, 3)
    const result = compareRunMetrics(
      [before, after],
      [
        metric(before, 5),
        {
          ...afterMetric,
          trace: {
            ...afterMetric.trace,
            zoneRegistryVersion: 2,
            zoneGeometryFingerprint: 'zone-fingerprint-v2',
          },
        },
      ],
    )
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'blocked') return
    expect(result.value.blockers).toContain('ZONE_REGISTRY_DRIFT')
  })

  it('requires at least one runtime-valid, explicit ok guardrail per run', () => {
    const before = { ...run('before-1', 'before', 1), guardrails: [] }
    const afterBase = run('after-1', 'after', 1)
    const after = {
      ...afterBase,
      guardrails: [
        {
          ...afterBase.guardrails[0]!,
          state: 'ship-it',
        },
      ],
    } as unknown as RunRecord
    const result = compareRunMetrics(
      [before, after],
      [metric(before, 5), metric(after, 3)],
    )
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'blocked') return
    expect(result.value.blockers).toContain('GUARDRAIL_NOT_OK')
    expect(result.value.affectedRunIds).toEqual(
      expect.arrayContaining(['before-1', 'after-1']),
    )
  })
})
