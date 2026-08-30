import {
  evaluateCoverage,
  getActiveDecision,
  getActiveHypothesis,
  getObservationState,
  type DomainSession,
  type FixtureBundle,
  type Phase,
} from '../domain'
import type { DerivedEvidence } from './derive'

export const EXPERIENCE_REQUIRED_RUNS_PER_PHASE = 3 as const

export type ExperienceAppPhase = 'empty' | 'loading' | 'ready' | 'error'
export type ExperienceMode = 'synthetic' | 'local'
export type ExperienceStage =
  | 'scope'
  | 'review'
  | 'change'
  | 'decision'
  | 'complete'

/**
 * UI interaction facts that cannot be reconstructed from evidence state.
 * Evidence readiness, blockers, hypothesis, comparison, and decision status
 * are deliberately not stored here; deriveExperienceFlow recomputes them.
 */
export interface ExperienceInteractionState {
  readonly scopeAcknowledged: boolean
  readonly reviewedRunIds: readonly string[]
}

export type ExperienceInteractionAction =
  | { readonly type: 'acknowledge-scope' }
  | { readonly type: 'mark-run-reviewed'; readonly runId: string }
  | { readonly type: 'reset' }

export function createExperienceInteractionState(): ExperienceInteractionState {
  return { scopeAcknowledged: false, reviewedRunIds: [] }
}

export function reduceExperienceInteraction(
  state: ExperienceInteractionState,
  action: ExperienceInteractionAction,
): ExperienceInteractionState {
  if (action.type === 'reset') return createExperienceInteractionState()
  if (action.type === 'acknowledge-scope') {
    return state.scopeAcknowledged ? state : { ...state, scopeAcknowledged: true }
  }

  const runId = action.runId.trim()
  if (runId.length === 0 || state.reviewedRunIds.includes(runId)) return state
  return { ...state, reviewedRunIds: [...state.reviewedRunIds, runId] }
}

export type ExperienceNextActionKind =
  | 'load-synthetic'
  | 'wait-for-workspace'
  | 'recover-workspace'
  | 'acknowledge-scope'
  | 'switch-to-synthetic'
  | 'review-run'
  | 'resolve-run-blockers'
  | 'write-change'
  | 'resolve-comparison-blockers'
  | 'record-decision'
  | 'complete'

export interface ExperienceNextAction {
  readonly kind: ExperienceNextActionKind
  readonly target: ExperienceStage
  readonly label: string
  readonly runId: string | null
  readonly blockers: readonly string[]
}

export interface ExperienceRunProgress {
  readonly runId: string
  readonly label: string
  readonly phase: Phase
  readonly order: number
  readonly interactionReviewed: boolean
  readonly eventReviewReady: boolean
  readonly coverageReady: boolean
  readonly metricReady: boolean
  readonly complete: boolean
  readonly blockers: readonly string[]
}

export interface ExperienceProgress {
  readonly completed: number
  readonly total: number
  readonly percent: number
  readonly scopeComplete: boolean
  readonly reviewedRuns: number
  readonly requiredRuns: 6
  readonly changeComplete: boolean
  readonly decisionComplete: boolean
}

export interface ExperienceFlowInput {
  readonly phase: ExperienceAppPhase
  readonly mode: ExperienceMode
  readonly fixture: FixtureBundle | null
  readonly session: DomainSession | null
  readonly derived: DerivedEvidence | null
  readonly interaction: ExperienceInteractionState
}

export interface ExperienceFlow {
  readonly stage: ExperienceStage
  readonly progress: ExperienceProgress
  readonly nextAction: ExperienceNextAction
  readonly runs: readonly ExperienceRunProgress[]
  readonly targetRunIds: readonly string[]
  readonly blockers: readonly string[]
  readonly comparisonBlockers: readonly string[]
  readonly affectedRunIds: readonly string[]
  readonly hasRequiredRuns: boolean
  readonly reviewComplete: boolean
  readonly comparisonReady: boolean
  readonly currentClaimEvidenceFingerprint: string | null
  readonly localThreePlusThreeUnavailable: boolean
}

const REQUIRED_RUN_COUNT = 6 as const
const TOTAL_PROGRESS_UNITS = 1 + REQUIRED_RUN_COUNT + 1 + 1
export const EXPERIENCE_LOCAL_LIMIT_BLOCKER =
  'LOCAL_1_PLUS_1_CANNOT_COMPLETE_3_PLUS_3' as const
export const EXPERIENCE_CLAIM_UNAVAILABLE_BLOCKER =
  'CLAIM_PACKAGE_UNAVAILABLE' as const
export const EXPERIENCE_DERIVATION_ERROR_BLOCKER =
  'DERIVATION_ERROR' as const

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function orderedRuns(fixture: FixtureBundle, phase: Phase) {
  return fixture.runs
    .filter((run) => run.phase === phase)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

function action(
  kind: ExperienceNextActionKind,
  target: ExperienceStage,
  label: string,
  runId: string | null = null,
  blockers: readonly string[] = [],
): ExperienceNextAction {
  return { kind, target, label, runId, blockers }
}

export function deriveExperienceFlow(input: ExperienceFlowInput): ExperienceFlow {
  const { phase, mode, fixture, session, derived, interaction } = input
  const beforeRuns = fixture === null
    ? []
    : orderedRuns(fixture, 'before')
  const afterRuns = fixture === null
    ? []
    : orderedRuns(fixture, 'after')
  const targetRuns = [...beforeRuns, ...afterRuns]
  const hasRequiredRuns =
    beforeRuns.length === EXPERIENCE_REQUIRED_RUNS_PER_PHASE &&
    afterRuns.length === EXPERIENCE_REQUIRED_RUNS_PER_PHASE

  const runs: readonly ExperienceRunProgress[] = targetRuns.map((run) => {
    const metric = derived?.metrics[run.id]
    const metricReady = metric?.status === 'computed'
    const interactionReviewed = interaction.reviewedRunIds.includes(run.id)
    const pendingObservation = session === null
      ? false
      : Object.values(session.observations)
          .filter((record) => record.candidate.payload.source.runId === run.id)
          .some((record) => {
            const state = getObservationState(record)
            return state === 'proposed' || state === 'edit-draft'
          })
    const eventReviewReady = !pendingObservation
    const coverage = fixture?.coverages[run.id]
    const coverageEvaluation = coverage === undefined
      ? null
      : evaluateCoverage(coverage)
    const coverageFingerprintReady =
      coverage !== undefined &&
      session !== null &&
      coverage.zoneGeometryFingerprint === session.zoneRegistry.geometryFingerprint
    const coverageReady =
      coverageEvaluation?.ok === true &&
      coverageEvaluation.value.status === 'full' &&
      coverageFingerprintReady
    const coverageBlockers = coverageEvaluation === null
      ? ['RUN_COVERAGE_MISMATCH']
      : coverageEvaluation.ok
        ? coverageEvaluation.value.blockers
        : [coverageEvaluation.error.code]
    const blockers = unique([
      ...(metric?.status === 'blocked' ? metric.blockers : []),
      ...coverageBlockers,
      ...(!coverageFingerprintReady && coverage !== undefined
        ? ['COVERAGE_ZONE_REGISTRY_MISMATCH']
        : []),
      ...(eventReviewReady ? [] : ['EVENT_REVIEW_PENDING']),
    ])
    return {
      runId: run.id,
      label: run.label,
      phase: run.phase,
      order: run.order,
      interactionReviewed,
      eventReviewReady,
      coverageReady,
      metricReady,
      complete:
        interactionReviewed && eventReviewReady && coverageReady && metricReady,
      blockers,
    }
  })

  const reviewedRuns = Math.min(
    REQUIRED_RUN_COUNT,
    runs.filter((run) => run.complete).length,
  )
  const reviewComplete = hasRequiredRuns && reviewedRuns === REQUIRED_RUN_COUNT
  const workspaceReady =
    phase === 'ready' && fixture !== null && session !== null && derived !== null
  const scopeComplete = workspaceReady && interaction.scopeAcknowledged
  const hypothesis = session === null ? undefined : getActiveHypothesis(session)
  const changeReady = hypothesis?.status === 'locked'
  const comparisonReady =
    derived?.comparison.status === 'shown' &&
    derived.claim !== undefined &&
    derived.error === undefined
  const claimFingerprint = comparisonReady
    ? derived.claim?.includedEvidenceFingerprint ?? null
    : null
  const decision = session === null ? undefined : getActiveDecision(session)
  const decisionComplete =
    scopeComplete &&
    reviewComplete &&
    comparisonReady &&
    changeReady &&
    decision !== undefined &&
    decision.hypothesisVersionId === hypothesis?.id &&
    decision.claimEvidenceFingerprint === claimFingerprint
  const localThreePlusThreeUnavailable = mode === 'local' && !hasRequiredRuns

  const runBlockers = runs.flatMap((run) => run.blockers)
  const comparisonBlockers = derived?.comparison.status === 'blocked'
    ? derived.comparison.blockers
    : []
  const affectedRunIds = derived?.comparison.status === 'blocked'
    ? derived.comparison.affectedRunIds
    : []
  const blockers = unique([
    ...runBlockers,
    ...comparisonBlockers,
    ...(
      mode === 'synthetic' && !hasRequiredRuns
        ? ['EXPERIENCE_RUN_COUNT_MISMATCH']
        : []
    ),
    ...(localThreePlusThreeUnavailable ? [EXPERIENCE_LOCAL_LIMIT_BLOCKER] : []),
    ...(
      derived?.comparison.status === 'shown' && derived.claim === undefined
        ? [EXPERIENCE_CLAIM_UNAVAILABLE_BLOCKER]
        : []
    ),
    ...(derived?.error === undefined ? [] : [EXPERIENCE_DERIVATION_ERROR_BLOCKER]),
  ])

  let stage: ExperienceStage
  if (!scopeComplete) stage = 'scope'
  else if (!reviewComplete) stage = 'review'
  else if (!comparisonReady) stage = 'decision'
  else if (!changeReady) stage = 'change'
  else if (!decisionComplete) stage = 'decision'
  else stage = 'complete'

  let nextAction: ExperienceNextAction
  if (phase === 'loading') {
    nextAction = action('wait-for-workspace', 'scope', '等待本地工作台载入')
  } else if (phase === 'error') {
    nextAction = action('recover-workspace', 'scope', '恢复 source 或改用合成演示')
  } else if (!workspaceReady) {
    nextAction = action('load-synthetic', 'scope', '载入合成体验')
  } else if (!interaction.scopeAcknowledged) {
    nextAction = action(
      'acknowledge-scope',
      'scope',
      mode === 'synthetic'
        ? '确认合成数据与结论边界'
        : '确认本地来源与 1+1 限制',
    )
  } else if (localThreePlusThreeUnavailable) {
    nextAction = action(
      'switch-to-synthetic',
      'review',
      '本地 1+1 无法完成 3+3；切换到合成体验',
      null,
      [EXPERIENCE_LOCAL_LIMIT_BLOCKER],
    )
  } else if (!reviewComplete) {
    const pending = runs.find((run) => !run.complete)
    if (pending === undefined) {
      nextAction = action(
        'resolve-run-blockers',
        'review',
        '补齐 3 个基线与 3 个改后 run',
        null,
        blockers,
      )
    } else if (!pending.interactionReviewed) {
      nextAction = action(
        'review-run',
        'review',
        `查看并复核 ${pending.label}`,
        pending.runId,
        pending.blockers,
      )
    } else {
      nextAction = action(
        'resolve-run-blockers',
        'review',
        `解除 ${pending.label} 的证据阻断`,
        pending.runId,
        pending.blockers,
      )
    }
  } else if (!comparisonReady) {
    nextAction = action(
      'resolve-comparison-blockers',
      'decision',
      '解除对比阻断后查看描述性差值',
      affectedRunIds[0] ?? null,
      blockers,
    )
  } else if (!changeReady) {
    nextAction = action('write-change', 'change', '写下并锁定一项可逆改动')
  } else if (!decisionComplete) {
    nextAction = action(
      'record-decision',
      'decision',
      '选择保留、撤销或证据不足',
    )
  } else {
    nextAction = action('complete', 'complete', '体验流程已完成')
  }

  const completed =
    (scopeComplete ? 1 : 0) +
    reviewedRuns +
    (reviewComplete && changeReady ? 1 : 0) +
    (decisionComplete ? 1 : 0)

  return {
    stage,
    progress: {
      completed,
      total: TOTAL_PROGRESS_UNITS,
      percent: Math.round((completed / TOTAL_PROGRESS_UNITS) * 100),
      scopeComplete,
      reviewedRuns,
      requiredRuns: REQUIRED_RUN_COUNT,
      changeComplete: reviewComplete && changeReady,
      decisionComplete,
    },
    nextAction,
    runs,
    targetRunIds: targetRuns.map((run) => run.id),
    blockers,
    comparisonBlockers,
    affectedRunIds,
    hasRequiredRuns,
    reviewComplete,
    comparisonReady,
    currentClaimEvidenceFingerprint: claimFingerprint,
    localThreePlusThreeUnavailable,
  }
}
