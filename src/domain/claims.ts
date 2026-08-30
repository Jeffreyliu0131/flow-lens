import { err, ok, type DomainResult } from './result'
import { fingerprintIncludedMetrics } from './fingerprints'
import type {
  ClaimPackage,
  DescriptiveComparison,
  ProvenanceKind,
} from './schema'

export const DESCRIPTIVE_CAVEAT =
  'A descriptive difference was observed. Attribution to the change is not established.'

const PROVENANCE_VALUES: readonly ProvenanceKind[] = [
  'synthetic',
  'project-owned',
  'licensed',
  'user-asserted-unverified',
]

function caveatForProvenance(provenance: ProvenanceKind): string {
  if (provenance === 'synthetic') {
    return `${DESCRIPTIVE_CAVEAT} The evidence is synthetic and does not establish real-world performance.`
  }
  if (provenance === 'user-asserted-unverified') {
    return `${DESCRIPTIVE_CAVEAT} The evidence provenance is user-asserted and unverified; ownership, permissions, and source correctness are not established.`
  }
  return `${DESCRIPTIVE_CAVEAT} The provenance label is ${provenance}; that label alone does not establish all required rights or source correctness.`
}

export function createClaimPackage(
  comparison: DescriptiveComparison,
  provenance: ProvenanceKind,
): DomainResult<ClaimPackage> {
  if (!PROVENANCE_VALUES.includes(provenance)) {
    return err('INVALID_PROVENANCE', 'Claim provenance is not allowed')
  }
  if (comparison.attribution !== 'not-established') {
    return err(
      'ATTRIBUTION_NOT_ALLOWED',
      'Only non-attributed descriptive comparisons are allowed',
    )
  }
  if (comparison.alternativeExplanations.length === 0) {
    return err(
      'ALTERNATIVES_REQUIRED',
      'Alternative explanations are required for a comparison claim',
    )
  }
  const expectedMetricCount =
    comparison.beforeRunIds.length + comparison.afterRunIds.length
  if (
    comparison.includedMetrics.length !== expectedMetricCount ||
    new Set(comparison.includedMetrics.map((metric) => metric.metricId)).size !==
      comparison.includedMetrics.length ||
    comparison.includedMetrics.some(
      (metric) =>
        metric.canonicalObservationIds.length !==
          metric.activeRevisionIds.length ||
        metric.coverageId.trim().length === 0 ||
        metric.ruleId.trim().length === 0 ||
        metric.zoneGeometryFingerprint.trim().length === 0,
    )
  ) {
    return err(
      'COMPARISON_EVIDENCE_INCOMPLETE',
      'Every included run metric must carry exact evidence and rule traces',
    )
  }
  const base = {
    kind: 'DESCRIPTIVE_COMPARISON' as const,
    comparison,
    title: 'Descriptive difference' as const,
    caveat: caveatForProvenance(provenance),
    includedEvidenceFingerprint: fingerprintIncludedMetrics(
      comparison.includedMetrics,
    ),
  }
  return provenance === 'synthetic'
    ? ok({ ...base, provenance, syntheticEvidenceOnly: true })
    : ok({ ...base, provenance, syntheticEvidenceOnly: false })
}

export function serializeClaimPackage(claim: ClaimPackage): string {
  return JSON.stringify(claim)
}
