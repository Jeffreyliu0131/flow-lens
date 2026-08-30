import {
  compareRunMetrics,
  computeRunMetric,
  createClaimPackage,
  DOMAIN_SCHEMA_VERSION,
  listCanonicalObservations,
  type ClaimPackage,
  type DescriptiveComparison,
  type DomainSession,
  type FixtureBundle,
  type ProvenanceKind,
  type RunMetricComputation,
  type RunMetricResult,
} from '../domain'
import {
  findSyntheticSourceMismatches,
  type SyntheticSourceDefinition,
} from '../fixtures'

export interface DerivedEvidence {
  readonly metrics: Readonly<Record<string, RunMetricComputation>>
  readonly computedMetrics: readonly RunMetricResult[]
  readonly comparison:
    | { readonly status: 'shown'; readonly comparison: DescriptiveComparison }
    | { readonly status: 'blocked'; readonly blockers: readonly string[]; readonly affectedRunIds: readonly string[] }
  readonly claim?: ClaimPackage
  readonly error?: string
}

export type EvidenceDiagnostics =
  | {
      readonly expectedProvenance: 'synthetic'
      readonly syntheticSources: Readonly<Record<string, SyntheticSourceDefinition>>
    }
  | {
      readonly expectedProvenance: Exclude<ProvenanceKind, 'synthetic'>
      readonly syntheticSources?: undefined
    }

const PROVENANCE_VALUES: readonly ProvenanceKind[] = [
  'synthetic',
  'project-owned',
  'licensed',
  'user-asserted-unverified',
]

function fixtureIntegrityIsValid(
  fixture: FixtureBundle,
  session: DomainSession,
  expectedProvenance: ProvenanceKind,
): boolean {
  return (
    fixture.manifest.schemaVersion === DOMAIN_SCHEMA_VERSION &&
    PROVENANCE_VALUES.includes(fixture.manifest.provenance) &&
    fixture.manifest.provenance === expectedProvenance &&
    fixture.manifest.fixtureId.trim().length > 0 &&
    fixture.manifest.fixtureId === session.fixtureId &&
    fixture.manifest.fixtureId === fixture.zoneRegistry.fixtureId &&
    fixture.manifest.fixtureId === session.zoneRegistry.fixtureId &&
    fixture.zoneRegistry.id === session.zoneRegistry.id &&
    fixture.zoneRegistry.version === session.zoneRegistry.version &&
    fixture.zoneRegistry.geometryFingerprint ===
      session.zoneRegistry.geometryFingerprint &&
    fixture.runs.every(
      (run) =>
        run.id.trim().length > 0 &&
        run.source.runId === run.id &&
        run.source.fixtureId === fixture.manifest.fixtureId,
    )
  )
}

export function deriveEvidence(
  fixture: FixtureBundle,
  session: DomainSession,
  diagnostics: EvidenceDiagnostics,
): DerivedEvidence {
  if (!fixtureIntegrityIsValid(fixture, session, diagnostics.expectedProvenance)) {
    return {
      metrics: {},
      computedMetrics: [],
      comparison: {
        status: 'blocked',
        blockers: ['WORKSPACE_FIXTURE_INTEGRITY_MISMATCH'],
        affectedRunIds: fixture.runs.map((run) => run.id),
      },
      error: 'Workspace fixture/session/schema/provenance integrity mismatch',
    }
  }

  const sourceMismatches = diagnostics.expectedProvenance === 'synthetic'
    ? findSyntheticSourceMismatches(
        session,
        fixture,
        diagnostics.syntheticSources,
      )
    : []
  if (sourceMismatches.length > 0) {
    return {
      metrics: Object.fromEntries(
        fixture.runs.map((run) => [
          run.id,
          {
            status: 'blocked' as const,
            runId: run.id,
            blockers: ['SYNTHETIC_SOURCE_LABEL_MISMATCH' as const],
          },
        ]),
      ),
      computedMetrics: [],
      comparison: {
        status: 'blocked',
        blockers: ['SYNTHETIC_SOURCE_LABEL_MISMATCH'],
        affectedRunIds: [
          ...new Set(sourceMismatches.map((mismatch) => mismatch.runId)),
        ],
      },
    }
  }

  const canonicals = listCanonicalObservations(session.observations)
  const metrics: Record<string, RunMetricComputation> = {}
  const computedMetrics: RunMetricResult[] = []

  for (const run of fixture.runs) {
    const coverage = fixture.coverages[run.id]
    if (coverage === undefined) {
      metrics[run.id] = {
        status: 'blocked',
        runId: run.id,
        blockers: ['RUN_COVERAGE_MISMATCH'],
      }
      continue
    }
    const result = computeRunMetric(
      run,
      canonicals.filter(
        (observation) => observation.payload.source.runId === run.id,
      ),
      coverage,
      session.zoneRegistry,
    )
    if (!result.ok) {
      return {
        metrics,
        computedMetrics,
        comparison: {
          status: 'blocked',
          blockers: ['MISSING_RUN_METRIC'],
          affectedRunIds: [run.id],
        },
        error: result.error.message,
      }
    }
    metrics[run.id] = result.value
    if (result.value.status === 'computed') {
      computedMetrics.push(result.value.metric)
    }
  }

  const comparisonResult = compareRunMetrics(fixture.runs, computedMetrics)
  if (!comparisonResult.ok) {
    return {
      metrics,
      computedMetrics,
      comparison: {
        status: 'blocked',
        blockers: ['MISSING_RUN_METRIC'],
        affectedRunIds: fixture.runs.map((run) => run.id),
      },
      error: comparisonResult.error.message,
    }
  }

  if (comparisonResult.value.status === 'shown') {
    const claimResult = createClaimPackage(
      comparisonResult.value.comparison,
      fixture.manifest.provenance,
    )
    if (!claimResult.ok) {
      return {
        metrics,
        computedMetrics,
        comparison: comparisonResult.value,
        error: claimResult.error.message,
      }
    }
    return {
      metrics,
      computedMetrics,
      comparison: comparisonResult.value,
      claim: claimResult.value,
    }
  }

  const blockedMetrics = Object.values(metrics).filter(
    (metric): metric is Extract<RunMetricComputation, { status: 'blocked' }> =>
      metric.status === 'blocked',
  )

  return {
    metrics,
    computedMetrics,
    comparison: {
      ...comparisonResult.value,
      blockers: [
        ...new Set([
          ...blockedMetrics.flatMap((metric) => metric.blockers),
          ...comparisonResult.value.blockers,
        ]),
      ],
      affectedRunIds: [
        ...new Set([
          ...blockedMetrics.map((metric) => metric.runId),
          ...comparisonResult.value.affectedRunIds,
        ]),
      ],
    },
  }
}
