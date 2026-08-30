import { describe, expect, it } from 'vitest'
import { computeRunMetric } from './metrics'
import { createVersionedZoneRegistry } from './zones'
import type {
  CanonicalObservation,
  ReviewCoverage,
  RunRecord,
  WorkUnitSignature,
} from './schema'

const registryResult = createVersionedZoneRegistry({
  id: 'zones:fixture-1:v1',
  fixtureId: 'fixture-1',
  version: 1,
  zones: [
    { id: 'zone-a', roleId: 'a', label: 'A', phaseGeometryVersion: 1, x: 0, y: 0, width: 40, height: 40 },
    { id: 'zone-b', roleId: 'b', label: 'B', phaseGeometryVersion: 1, x: 50, y: 0, width: 40, height: 40 },
  ],
})
if (!registryResult.ok) throw new Error(registryResult.error.message)
const zoneRegistry = registryResult.value

const signature: WorkUnitSignature = {
  id: 'sig-1',
  skuAlias: 'SKU-1',
  taskBoundary: 'one parcel',
  materials: ['box'],
  completionRule: 'closed',
  version: 1,
}

const run: RunRecord = {
  id: 'before-1',
  label: 'Before 1',
  phase: 'before',
  order: 1,
  durationMs: 1_000,
  source: {
    fixtureId: 'fixture-1',
    assetId: 'asset-1',
    runId: 'before-1',
    startMs: 0,
    endMs: 1_000,
  },
  signature,
  comparability: 'eligible',
  observability: 'stable',
  guardrails: [
    { id: 'g1', label: 'Quality', state: 'ok', note: 'No change.' },
  ],
}

const coverage: ReviewCoverage = {
  id: 'coverage-1',
  runId: run.id,
  version: 1,
  runDurationMs: run.durationMs,
  reviewedIntervals: [{ startMs: 0, endMs: 1_000 }],
  unknownIntervals: [],
  unreviewedIntervals: [],
  candidateIndependentSweep: true,
  finalized: true,
  zoneGeometryFingerprint: zoneRegistry.geometryFingerprint,
}

function observation(
  id: string,
  revision: string,
  zoneId: string,
  startMs: number,
  endMs: number,
  eventKind: 'zone-entry' | 'zone-dwell' | 'zone-revisit' = 'zone-entry',
): CanonicalObservation {
  return {
    id,
    observationId: id,
    activeRevisionId: revision,
    state: 'confirmed',
    payload: {
      source: {
        fixtureId: 'fixture-1',
        assetId: 'asset-1',
        runId: run.id,
        startMs,
        endMs,
      },
      zoneId,
      eventType: 'HAND_ZONE_PRESENCE_INTERVAL',
      eventKind,
    },
  }
}

describe('run metrics', () => {
  it('computes confirmed-only count, duration, transitions, and trace', () => {
    const result = computeRunMetric(
      run,
      [
        observation('e1', 'r1', 'zone-a', 100, 200, 'zone-entry'),
        observation('e2', 'r2', 'zone-b', 300, 500, 'zone-dwell'),
        observation('e3', 'r3', 'zone-b', 600, 700, 'zone-revisit'),
      ],
      coverage,
      zoneRegistry,
    )
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.status !== 'computed') return
    expect(result.value.metric.presenceCount).toBe(3)
    expect(result.value.metric.confirmedDurationMs).toBe(400)
    expect(result.value.metric.transitionCount).toBe(1)
    expect(result.value.metric.trace.activeRevisionIds).toEqual(['r1', 'r2', 'r3'])
    expect(result.value.metric.trace.zoneGeometryFingerprint).toBe(
      zoneRegistry.geometryFingerprint,
    )
  })

  it('blocks partial coverage and cross-run or overlapping observations', () => {
    const partial = computeRunMetric(
      run,
      [],
      {
        ...coverage,
        reviewedIntervals: [{ startMs: 0, endMs: 500 }],
        unreviewedIntervals: [{ startMs: 500, endMs: 1_000 }],
      },
      zoneRegistry,
    )
    expect(partial.ok && partial.value.status).toBe('blocked')

    const wrongRun = {
      ...observation('e1', 'r1', 'zone-a', 100, 300),
      payload: {
        ...observation('e1', 'r1', 'zone-a', 100, 300).payload,
        source: {
          ...observation('e1', 'r1', 'zone-a', 100, 300).payload.source,
          runId: 'after-1',
        },
      },
    }
    const blocked = computeRunMetric(
      run,
      [wrongRun, observation('e2', 'r2', 'zone-b', 200, 400)],
      coverage,
      zoneRegistry,
    )
    expect(blocked.ok).toBe(true)
    if (!blocked.ok || blocked.value.status !== 'blocked') return
    expect(blocked.value.blockers).toContain('CROSS_RUN_OBSERVATION')
    expect(blocked.value.blockers).toContain('OVERLAPPING_CANONICAL_EVENTS')
  })

  it('fails closed on non-finite, provenance, enum, and zone mismatches', () => {
    const base = observation('e1', 'r1', 'zone-a', 100, 200)
    const invalid = [
      {
        ...base,
        id: 'nan',
        payload: {
          ...base.payload,
          source: { ...base.payload.source, startMs: Number.NaN },
        },
      },
      {
        ...base,
        id: 'fixture',
        payload: {
          ...base.payload,
          source: { ...base.payload.source, fixtureId: 'other-fixture' },
        },
      },
      {
        ...base,
        id: 'asset',
        payload: {
          ...base.payload,
          source: { ...base.payload.source, assetId: 'other-asset' },
        },
      },
      { ...base, id: 'zone', payload: { ...base.payload, zoneId: 'missing-zone' } },
      {
        ...base,
        id: 'type',
        payload: { ...base.payload, eventType: 'PICK' },
      },
      {
        ...base,
        id: 'kind',
        payload: { ...base.payload, eventKind: 'optimized-reach' },
      },
      {
        ...base,
        id: 'state',
        state: 'rejected',
        activeRevisionId: '',
      },
    ] as unknown as CanonicalObservation[]

    for (const value of invalid) {
      const result = computeRunMetric(run, [value], coverage, zoneRegistry)
      expect(result.ok).toBe(true)
      if (!result.ok || result.value.status !== 'blocked') continue
      expect(result.value.blockers.length).toBeGreaterThan(0)
    }

    const staleCoverage = computeRunMetric(
      run,
      [base],
      { ...coverage, zoneGeometryFingerprint: 'stale-zone-geometry' },
      zoneRegistry,
    )
    expect(staleCoverage.ok).toBe(true)
    if (!staleCoverage.ok || staleCoverage.value.status !== 'blocked') return
    expect(staleCoverage.value.blockers).toContain(
      'COVERAGE_ZONE_REGISTRY_MISMATCH',
    )
  })

  it('requires explicit re-review after zone geometry changes', () => {
    const changedRegistryResult = createVersionedZoneRegistry({
      id: 'zones:fixture-1:v2',
      fixtureId: 'fixture-1',
      version: 2,
      zones: zoneRegistry.zones.map((zone) =>
        zone.id === 'zone-a' ? { ...zone, width: zone.width - 5 } : zone,
      ),
    })
    if (!changedRegistryResult.ok) throw new Error(changedRegistryResult.error.message)
    const changedRegistry = changedRegistryResult.value
    const canonical = observation('e1', 'r1', 'zone-a', 100, 200)
    const stale = computeRunMetric(run, [canonical], coverage, changedRegistry)
    expect(stale.ok).toBe(true)
    if (!stale.ok || stale.value.status !== 'blocked') return
    expect(stale.value.blockers).toContain('COVERAGE_ZONE_REGISTRY_MISMATCH')

    const rereviewed = computeRunMetric(
      run,
      [canonical],
      {
        ...coverage,
        id: 'coverage-2',
        version: 2,
        zoneGeometryFingerprint: changedRegistry.geometryFingerprint,
      },
      changedRegistry,
    )
    expect(rereviewed.ok).toBe(true)
    if (!rereviewed.ok || rereviewed.value.status !== 'computed') return
    expect(rereviewed.value.metric.trace.zoneRegistryVersion).toBe(2)
    expect(rereviewed.value.metric.trace.zoneGeometryFingerprint).not.toBe(
      zoneRegistry.geometryFingerprint,
    )
  })
})
