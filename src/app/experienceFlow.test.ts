import { describe, expect, it } from 'vitest'
import {
  applySessionCommand,
  getObservationState,
  type DomainSession,
  type FixtureBundle,
  type SessionCommand,
} from '../domain'
import {
  createSyntheticWorkbench,
  type SyntheticScenarioId,
} from '../fixtures'
import { deriveEvidence, type DerivedEvidence } from './derive'
import {
  createExperienceInteractionState,
  deriveExperienceFlow,
  EXPERIENCE_CLAIM_UNAVAILABLE_BLOCKER,
  EXPERIENCE_DERIVATION_ERROR_BLOCKER,
  EXPERIENCE_LOCAL_LIMIT_BLOCKER,
  reduceExperienceInteraction,
  type ExperienceInteractionState,
} from './experienceFlow'

function apply(state: DomainSession, command: SessionCommand): DomainSession {
  const result = applySessionCommand(state, command)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

function acknowledge(
  runIds: readonly string[] = [],
): ExperienceInteractionState {
  let state = reduceExperienceInteraction(
    createExperienceInteractionState(),
    { type: 'acknowledge-scope' },
  )
  for (const runId of runIds) {
    state = reduceExperienceInteraction(state, {
      type: 'mark-run-reviewed',
      runId,
    })
  }
  return state
}

function resolvePendingObservations(session: DomainSession): DomainSession {
  let next = session
  let sequence = 0
  for (const record of Object.values(session.observations)) {
    if (getObservationState(record) !== 'proposed') continue
    sequence += 1
    next = apply(next, {
      type: 'confirm-observation',
      observationId: record.candidate.id,
      id: `experience:confirm:${sequence}`,
      actorId: 'local-operator',
      atMs: 100 + sequence,
    })
  }
  return next
}

function eligibleContext(resolvePending = false) {
  const scenario = createSyntheticWorkbench().scenarios.eligible
  const session = resolvePending
    ? resolvePendingObservations(scenario.session)
    : scenario.session
  return {
    fixture: scenario.fixture,
    session,
    derived: deriveEvidence(scenario.fixture, session, {
      expectedProvenance: 'synthetic',
      syntheticSources: scenario.sources,
    }),
  }
}

function lockChange(session: DomainSession): DomainSession {
  let next = apply(session, {
    type: 'set-hypothesis-draft',
    id: 'experience:hypothesis:draft',
    actorId: 'local-operator',
    atMs: 1,
    text: '把合成胶带区移近纸箱，并继续复录。',
  })
  next = apply(next, {
    type: 'lock-hypothesis',
    id: 'experience:hypothesis:locked',
    actorId: 'local-operator',
    atMs: 2,
  })
  return next
}

describe('experience interaction reducer', () => {
  it('stores only scope/run interaction facts, deduplicates marks, and resets', () => {
    const initial = createExperienceInteractionState()
    expect(initial).toEqual({ scopeAcknowledged: false, reviewedRunIds: [] })

    const acknowledged = reduceExperienceInteraction(initial, {
      type: 'acknowledge-scope',
    })
    const reviewed = reduceExperienceInteraction(acknowledged, {
      type: 'mark-run-reviewed',
      runId: ' before-1 ',
    })
    expect(reviewed).toEqual({
      scopeAcknowledged: true,
      reviewedRunIds: ['before-1'],
    })
    expect(
      reduceExperienceInteraction(reviewed, {
        type: 'mark-run-reviewed',
        runId: 'before-1',
      }),
    ).toBe(reviewed)
    expect(
      reduceExperienceInteraction(reviewed, {
        type: 'mark-run-reviewed',
        runId: '   ',
      }),
    ).toBe(reviewed)
    expect(reduceExperienceInteraction(reviewed, { type: 'reset' })).toEqual(
      initial,
    )
  })
})

describe('experience flow selector', () => {
  it.each([
    ['empty', 'load-synthetic'],
    ['loading', 'wait-for-workspace'],
    ['error', 'recover-workspace'],
  ] as const)(
    'keeps the %s workspace in scope with an honest recovery action',
    (phase, nextActionKind) => {
      const flow = deriveExperienceFlow({
        phase,
        mode: 'synthetic',
        fixture: null,
        session: null,
        derived: null,
        interaction: createExperienceInteractionState(),
      })
      expect(flow.stage).toBe('scope')
      expect(flow.nextAction.kind).toBe(nextActionKind)
      expect(flow.progress.completed).toBe(0)
    },
  )

  it('requires an explicit scope acknowledgement before review', () => {
    const context = eligibleContext()
    const flow = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      ...context,
      interaction: createExperienceInteractionState(),
    })
    expect(flow.stage).toBe('scope')
    expect(flow.nextAction.kind).toBe('acknowledge-scope')
    expect(flow.progress.scopeComplete).toBe(false)
  })

  it('requires both interaction review and a computed metric for all 3 + 3 runs', () => {
    const unresolved = eligibleContext()
    const unresolvedFlow = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      ...unresolved,
      interaction: acknowledge(unresolved.fixture.runs.map((run) => run.id)),
    })
    expect(unresolvedFlow.runs[0]).toMatchObject({
      runId: 'before-1',
      interactionReviewed: true,
      eventReviewReady: false,
      coverageReady: true,
      metricReady: true,
      complete: false,
    })
    expect(unresolvedFlow.runs[0]?.blockers).toContain('EVENT_REVIEW_PENDING')

    const context = eligibleContext(true)
    const runIds = context.fixture.runs.map((run) => run.id)
    const first = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      ...context,
      interaction: acknowledge(),
    })
    expect(first.stage).toBe('review')
    expect(first.nextAction).toMatchObject({
      kind: 'review-run',
      runId: 'before-1',
    })
    expect(first.runs).toHaveLength(6)
    expect(first.runs.every((run) => run.metricReady)).toBe(true)
    expect(first.progress.reviewedRuns).toBe(0)

    const five = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      ...context,
      interaction: acknowledge(runIds.slice(0, 5)),
    })
    expect(five.stage).toBe('review')
    expect(five.progress.reviewedRuns).toBe(5)

    const all = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      ...context,
      interaction: acknowledge(runIds),
    })
    expect(all.reviewComplete).toBe(true)
    expect(all.stage).toBe('change')
    expect(all.nextAction.kind).toBe('write-change')
    expect(all.progress.reviewedRuns).toBe(6)
  })

  it('does not count an interaction mark when its run metric is blocked', () => {
    const scenario = createSyntheticWorkbench().scenarios['coverage-gap']
    const session = resolvePendingObservations(scenario.session)
    const derived = deriveEvidence(scenario.fixture, session, {
      expectedProvenance: 'synthetic',
      syntheticSources: scenario.sources,
    })
    const flow = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      fixture: scenario.fixture,
      session,
      derived,
      interaction: acknowledge(scenario.fixture.runs.map((run) => run.id)),
    })
    expect(flow.reviewComplete).toBe(false)
    expect(flow.progress.reviewedRuns).toBe(5)
    expect(flow.nextAction).toMatchObject({
      kind: 'resolve-run-blockers',
      runId: 'after-3',
    })
    expect(flow.nextAction.blockers).toEqual(
      expect.arrayContaining([
        'UNKNOWN_INTERVALS_PRESENT',
        'UNREVIEWED_INTERVALS_PRESENT',
      ]),
    )
  })

  it('advances through a locked change and only completes on the current claim fingerprint', () => {
    const context = eligibleContext(true)
    const interaction = acknowledge(context.fixture.runs.map((run) => run.id))
    const locked = lockChange(context.session)
    const decisionFlow = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      fixture: context.fixture,
      session: locked,
      derived: context.derived,
      interaction,
    })
    expect(decisionFlow.stage).toBe('decision')
    expect(decisionFlow.comparisonReady).toBe(true)
    expect(decisionFlow.nextAction.kind).toBe('record-decision')
    expect(decisionFlow.currentClaimEvidenceFingerprint).toMatch(/^[0-9a-f]{8}$/)

    const staleDecision = apply(locked, {
      type: 'set-decision',
      id: 'experience:decision:stale',
      actorId: 'local-operator',
      atMs: 3,
      outcome: 'keep',
      claimEvidenceFingerprint: 'stale-claim',
    })
    expect(
      deriveExperienceFlow({
        phase: 'ready',
        mode: 'synthetic',
        fixture: context.fixture,
        session: staleDecision,
        derived: context.derived,
        interaction,
      }).stage,
    ).toBe('decision')

    const completedSession = apply(locked, {
      type: 'set-decision',
      id: 'experience:decision:current',
      actorId: 'local-operator',
      atMs: 4,
      outcome: 'uncertain',
      claimEvidenceFingerprint:
        decisionFlow.currentClaimEvidenceFingerprint ?? 'missing',
    })
    const completed = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      fixture: context.fixture,
      session: completedSession,
      derived: context.derived,
      interaction,
    })
    expect(completed.stage).toBe('complete')
    expect(completed.nextAction.kind).toBe('complete')
    expect(completed.progress).toMatchObject({
      completed: 9,
      total: 9,
      percent: 100,
      decisionComplete: true,
    })
  })

  it('requires shown comparison + ClaimPackage + no derivation error', () => {
    const context = eligibleContext(true)
    const locked = lockChange(context.session)
    const interaction = acknowledge(context.fixture.runs.map((run) => run.id))
    const withoutClaim: DerivedEvidence = {
      metrics: context.derived.metrics,
      computedMetrics: context.derived.computedMetrics,
      comparison: context.derived.comparison,
    }
    const missingClaim = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      fixture: context.fixture,
      session: locked,
      derived: withoutClaim,
      interaction,
    })
    expect(missingClaim.comparisonReady).toBe(false)
    expect(missingClaim.blockers).toContain(
      EXPERIENCE_CLAIM_UNAVAILABLE_BLOCKER,
    )

    const withError: DerivedEvidence = {
      ...context.derived,
      error: 'claim derivation failed',
    }
    const errored = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      fixture: context.fixture,
      session: locked,
      derived: withError,
      interaction,
    })
    expect(errored.comparisonReady).toBe(false)
    expect(errored.blockers).toContain(EXPERIENCE_DERIVATION_ERROR_BLOCKER)
  })

  it('states that the current local 1 + 1 path cannot complete 3 + 3', () => {
    const context = eligibleContext(true)
    const runs = [
      context.fixture.runs.find((run) => run.id === 'before-1')!,
      context.fixture.runs.find((run) => run.id === 'after-1')!,
    ]
    const localFixture: FixtureBundle = {
      ...context.fixture,
      manifest: {
        ...context.fixture.manifest,
        provenance: 'user-asserted-unverified',
      },
      runs,
      coverages: Object.fromEntries(
        runs.map((run) => [run.id, context.fixture.coverages[run.id]!]),
      ),
    }
    const localDerived = deriveEvidence(localFixture, context.session, {
      expectedProvenance: 'user-asserted-unverified',
    })
    const scopeFlow = deriveExperienceFlow({
      phase: 'ready',
      mode: 'local',
      fixture: localFixture,
      session: context.session,
      derived: localDerived,
      interaction: createExperienceInteractionState(),
    })
    expect(scopeFlow.nextAction).toMatchObject({
      kind: 'acknowledge-scope',
      label: '确认本地来源与 1+1 限制',
    })
    const flow = deriveExperienceFlow({
      phase: 'ready',
      mode: 'local',
      fixture: localFixture,
      session: context.session,
      derived: localDerived,
      interaction: acknowledge(runs.map((run) => run.id)),
    })
    expect(flow.hasRequiredRuns).toBe(false)
    expect(flow.localThreePlusThreeUnavailable).toBe(true)
    expect(flow.progress).toMatchObject({ reviewedRuns: 2, requiredRuns: 6 })
    expect(flow.blockers).toContain(EXPERIENCE_LOCAL_LIMIT_BLOCKER)
    expect(flow.nextAction.kind).toBe('switch-to-synthetic')
    expect(flow.nextAction.label).toContain('本地 1+1')
  })

  it('does not silently slice an extra run away from the 3 + 3 contract', () => {
    const context = eligibleContext(true)
    const extraRun = {
      ...context.fixture.runs[0]!,
      id: 'before-4',
      label: '基线 4',
      order: 4,
      source: {
        ...context.fixture.runs[0]!.source,
        runId: 'before-4',
        assetId: 'synthetic:before-4',
      },
    }
    const fixture: FixtureBundle = {
      ...context.fixture,
      runs: [...context.fixture.runs, extraRun],
      coverages: {
        ...context.fixture.coverages,
        'before-4': {
          ...context.fixture.coverages['before-1']!,
          id: 'coverage:before-4:v1',
          runId: 'before-4',
        },
      },
    }
    const derived: DerivedEvidence = {
      ...context.derived,
      metrics: {
        ...context.derived.metrics,
        'before-4': context.derived.metrics['before-1']!,
      },
    }
    const flow = deriveExperienceFlow({
      phase: 'ready',
      mode: 'synthetic',
      fixture,
      session: context.session,
      derived,
      interaction: acknowledge(fixture.runs.map((run) => run.id)),
    })
    expect(flow.hasRequiredRuns).toBe(false)
    expect(flow.reviewComplete).toBe(false)
    expect(flow.targetRunIds).toContain('before-4')
    expect(flow.blockers).toContain('EXPERIENCE_RUN_COUNT_MISMATCH')
  })

  it.each([
    ['coverage-gap', 'UNKNOWN_INTERVALS_PRESENT'],
    ['incomparable', 'INCOMPARABLE_RUN'],
    ['observability-shift', 'OBSERVABILITY_SHIFT'],
    ['guardrail-harm', 'GUARDRAIL_NOT_OK'],
    ['source-mismatch', 'SYNTHETIC_SOURCE_LABEL_MISMATCH'],
  ] as const)(
    'preserves the exact %s blocker code',
    (scenarioId: SyntheticScenarioId, expectedBlocker: string) => {
      const scenario = createSyntheticWorkbench().scenarios[scenarioId]
      const base = deriveEvidence(scenario.fixture, scenario.session, {
        expectedProvenance: 'synthetic',
        syntheticSources: scenario.sources,
      })
      const derived: DerivedEvidence =
        scenario.comparison.status === 'blocked'
          ? {
              metrics: base.metrics,
              computedMetrics: base.computedMetrics,
              comparison: {
                status: 'blocked',
                blockers: scenario.comparison.blockers,
                affectedRunIds: scenario.comparison.affectedRunIds,
              },
            }
          : base
      const flow = deriveExperienceFlow({
        phase: 'ready',
        mode: 'synthetic',
        fixture: scenario.fixture,
        session: scenario.session,
        derived,
        interaction: acknowledge(scenario.fixture.runs.map((run) => run.id)),
      })
      expect(flow.blockers).toContain(expectedBlocker)
    },
  )
})
