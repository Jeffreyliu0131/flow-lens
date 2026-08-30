export const DOMAIN_SCHEMA_VERSION = 1 as const

export type Phase = 'before' | 'after'
export type ProvenanceKind =
  | 'synthetic'
  | 'project-owned'
  | 'licensed'
  | 'user-asserted-unverified'
export type ObservationProducer = 'human' | 'synthetic' | 'model'
export type ObservationType =
  | 'HAND_ZONE_PRESENCE_INTERVAL'
  | 'VISIBLE_CONTACT'
export type EventKind = 'zone-entry' | 'zone-dwell' | 'zone-revisit'
export type ObservationState =
  | 'proposed'
  | 'confirmed'
  | 'edited-final'
  | 'rejected'
  | 'uncertain'
  | 'edit-draft'
export type ReviewAction =
  | 'confirm'
  | 'reject'
  | 'uncertain'
  | 'edit-draft'
  | 'finalize-edit'
  | 'cancel-edit'
  | 'restore'
export type ObservabilityState = 'stable' | 'shifted' | 'unknown'
export type ComparabilityState = 'eligible' | 'incomparable'
export type GuardrailState = 'ok' | 'harm' | 'unknown'
export type HypothesisStatus = 'draft' | 'locked'
export type DecisionOutcome = 'keep' | 'revert' | 'uncertain'

export interface FixtureManifest {
  readonly schemaVersion: typeof DOMAIN_SCHEMA_VERSION
  readonly fixtureId: string
  readonly seed: string
  readonly title: string
  readonly provenance: ProvenanceKind
  readonly sourceNote: string
  readonly privateDataForbidden: true
}

export interface WorkUnitSignature {
  readonly id: string
  readonly skuAlias: string
  readonly taskBoundary: string
  readonly materials: readonly string[]
  readonly completionRule: string
  readonly version: number
}

export interface SourceRef {
  readonly fixtureId: string
  readonly assetId: string
  readonly runId: string
  readonly startMs: number
  readonly endMs: number
}

export interface GuardrailObservation {
  readonly id: string
  readonly label: string
  readonly state: GuardrailState
  readonly note: string
}

export interface RunRecord {
  readonly id: string
  readonly label: string
  readonly phase: Phase
  readonly order: number
  readonly durationMs: number
  readonly source: SourceRef
  readonly signature: WorkUnitSignature
  readonly comparability: ComparabilityState
  readonly incomparableReason?: string
  readonly observability: ObservabilityState
  readonly guardrails: readonly GuardrailObservation[]
}

export interface ZoneDefinition {
  readonly id: string
  readonly roleId: string
  readonly label: string
  readonly phaseGeometryVersion: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface VersionedZoneRegistry {
  readonly id: string
  readonly fixtureId: string
  readonly version: number
  readonly zones: readonly ZoneDefinition[]
  readonly geometryFingerprint: string
}

export interface ObservationPayload {
  readonly source: SourceRef
  readonly zoneId: string
  readonly eventType: ObservationType
  readonly eventKind: EventKind
}

export interface CandidateObservation {
  readonly id: string
  readonly payload: ObservationPayload
  readonly producer: ObservationProducer
  readonly confidence?: number
  readonly state: 'proposed'
}

export interface ReviewRevision {
  readonly id: string
  readonly observationId: string
  readonly action: ReviewAction
  readonly actorId: string
  readonly createdAtMs: number
  readonly resultingState: ObservationState
  readonly payload?: ObservationPayload
  readonly previousRevisionId?: string
  readonly draftRevisionId?: string
  readonly targetRevisionId?: string
  readonly reason?: string
}

export interface ObservationRecord {
  readonly candidate: CandidateObservation
  readonly revisions: readonly ReviewRevision[]
  readonly activeRevisionId?: string
  readonly draftRevisionId?: string
}

export interface CanonicalObservation {
  readonly id: string
  readonly observationId: string
  readonly activeRevisionId: string
  readonly state: 'confirmed' | 'edited-final'
  readonly payload: ObservationPayload
}

export interface TimeInterval {
  readonly startMs: number
  readonly endMs: number
}

export interface ReviewCoverage {
  readonly id: string
  readonly runId: string
  readonly version: number
  readonly runDurationMs: number
  readonly reviewedIntervals: readonly TimeInterval[]
  readonly unknownIntervals: readonly TimeInterval[]
  readonly unreviewedIntervals: readonly TimeInterval[]
  readonly candidateIndependentSweep: boolean
  readonly finalized: boolean
  readonly zoneGeometryFingerprint: string
}

export interface RulePackage {
  readonly id: string
  readonly version: string
  readonly description: string
}

export interface MetricTrace {
  readonly canonicalObservationIds: readonly string[]
  readonly activeRevisionIds: readonly string[]
  readonly coverageId: string
  readonly coverageVersion: number
  readonly ruleId: string
  readonly ruleVersion: string
  readonly zoneRegistryId: string
  readonly zoneRegistryVersion: number
  readonly zoneGeometryFingerprint: string
}

export interface RunMetricResult {
  readonly id: string
  readonly runId: string
  readonly fixtureId: string
  readonly assetId: string
  readonly phase: Phase
  readonly signatureId: string
  readonly signatureFingerprint: string
  readonly observability: ObservabilityState
  readonly scope: 'full-run'
  readonly presenceCount: number
  readonly confirmedDurationMs: number
  readonly transitionCount: number
  readonly trace: MetricTrace
  readonly stale: false
}

export interface DistributionSummary {
  readonly values: readonly number[]
  readonly median: number
  readonly min: number
  readonly max: number
}

export interface ComparisonMeasure {
  readonly before: DistributionSummary
  readonly after: DistributionSummary
  readonly signedDifference: number
}

export interface IncludedMetricEvidence {
  readonly metricId: string
  readonly runId: string
  readonly fixtureId: string
  readonly assetId: string
  readonly phase: Phase
  readonly signatureId: string
  readonly signatureFingerprint: string
  readonly canonicalObservationIds: readonly string[]
  readonly activeRevisionIds: readonly string[]
  readonly coverageId: string
  readonly coverageVersion: number
  readonly ruleId: string
  readonly ruleVersion: string
  readonly zoneRegistryId: string
  readonly zoneRegistryVersion: number
  readonly zoneGeometryFingerprint: string
}

export interface ComparisonRule {
  readonly id: string
  readonly version: string
  readonly minimumRunsPerPhase: number
}

export interface DescriptiveComparison {
  readonly id: string
  readonly comparisonRule: ComparisonRule
  readonly beforeRunIds: readonly string[]
  readonly afterRunIds: readonly string[]
  readonly includedMetrics: readonly IncludedMetricEvidence[]
  readonly presenceCount: ComparisonMeasure
  readonly confirmedDurationMs: ComparisonMeasure
  readonly transitionCount: ComparisonMeasure
  readonly attribution: 'not-established'
  readonly alternativeExplanations: readonly string[]
  readonly guardrailNotes: readonly string[]
}

interface ClaimPackageBase {
  readonly kind: 'DESCRIPTIVE_COMPARISON'
  readonly comparison: DescriptiveComparison
  readonly title: 'Descriptive difference'
  readonly caveat: string
  readonly includedEvidenceFingerprint: string
}

export type ClaimPackage = ClaimPackageBase &
  (
    | {
        readonly provenance: 'synthetic'
        readonly syntheticEvidenceOnly: true
      }
    | {
        readonly provenance: Exclude<ProvenanceKind, 'synthetic'>
        readonly syntheticEvidenceOnly: false
      }
  )

export interface HypothesisVersion {
  readonly id: string
  readonly text: string
  readonly status: HypothesisStatus
  readonly actorId: string
  readonly createdAtMs: number
  readonly previousVersionId?: string
}

export interface HypothesisState {
  readonly versions: readonly HypothesisVersion[]
  readonly activeVersionId?: string
}

export interface DecisionRecord {
  readonly id: string
  readonly hypothesisVersionId: string
  readonly claimEvidenceFingerprint: string
  readonly outcome: DecisionOutcome
  readonly actorId: string
  readonly createdAtMs: number
}

export interface DomainSession {
  readonly fixtureId: string
  readonly zoneRegistry: VersionedZoneRegistry
  readonly observations: Readonly<Record<string, ObservationRecord>>
  readonly revisionOrder: readonly string[]
  readonly hypothesis: HypothesisState
  readonly decisions: readonly DecisionRecord[]
  readonly activeDecisionId?: string
  readonly version: number
}

export interface FixtureBundle {
  readonly manifest: FixtureManifest
  readonly zoneRegistry: VersionedZoneRegistry
  readonly runs: readonly RunRecord[]
  readonly coverages: Readonly<Record<string, ReviewCoverage>>
}
