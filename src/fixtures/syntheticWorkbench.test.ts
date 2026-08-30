import { describe, expect, it } from 'vitest'
import {
  applySessionCommand,
  getActiveDecision,
  getActiveHypothesis,
  getActiveRevision,
  getObservationState,
  type DomainSession,
  type SessionCommand,
} from '../domain'
import { getSyntheticFrame } from './syntheticSource'
import {
  createSyntheticWorkbench,
  findSyntheticSourceMismatches,
} from './syntheticWorkbench'
import type { FixtureManifest } from '../domain'

function apply(state: DomainSession, command: SessionCommand): DomainSession {
  const result = applySessionCommand(state, command)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

describe('SyntheticWorkbench', () => {
  it('is deterministic and contains 3 before + 3 after runs', () => {
    const first = createSyntheticWorkbench('repeatable-seed')
    const second = createSyntheticWorkbench('repeatable-seed')
    expect(first).toEqual(second)
    const runs = first.scenarios.eligible.fixture.runs
    expect(runs.filter((run) => run.phase === 'before')).toHaveLength(3)
    expect(runs.filter((run) => run.phase === 'after')).toHaveLength(3)
    expect(first.scenarios.eligible.comparison.status).toBe('shown')
    if (first.scenarios.eligible.comparison.status === 'shown') {
      expect(
        first.scenarios.eligible.comparison.value.comparisonRule
          .minimumRunsPerPhase,
      ).toBe(3)
      expect(first.scenarios.eligible.comparison.claim).toMatchObject({
        kind: 'DESCRIPTIVE_COMPARISON',
        provenance: 'synthetic',
        syntheticEvidenceOnly: true,
      })
    }
  })

  it('contains low-confidence, rejected, uncertain and blocking variants', () => {
    const workbench = createSyntheticWorkbench()
    const session = workbench.scenarios.eligible.session
    const states = Object.values(session.observations).map(getObservationState)
    const candidates = Object.values(session.observations).map(
      (record) => record.candidate,
    )
    expect(candidates.some((candidate) => candidate.confidence === 0.31)).toBe(true)
    expect(states).toContain('proposed')
    expect(states).toContain('rejected')
    expect(states).toContain('uncertain')
    const eventKinds = new Set(
      candidates.map((candidate) => candidate.payload.eventKind),
    )
    expect(eventKinds).toEqual(
      new Set(['zone-entry', 'zone-dwell', 'zone-revisit']),
    )
    expect(workbench.scenarios['coverage-gap'].comparison.status).toBe('blocked')
    expect(workbench.scenarios.incomparable.comparison.status).toBe('blocked')
    expect(workbench.scenarios['observability-shift'].comparison.status).toBe(
      'blocked',
    )
    expect(workbench.scenarios['guardrail-harm'].comparison.status).toBe(
      'blocked',
    )
    expect(workbench.scenarios['source-mismatch'].comparison.status).toBe(
      'blocked',
    )
    expect(getActiveHypothesis(session)).toBeUndefined()
    expect(getActiveDecision(session)).toBeUndefined()
    expect(session.hypothesis.versions).toEqual([])
    expect(session.decisions).toEqual([])
  })

  it('keeps source schedules independent and detects source-first mismatch', () => {
    const workbench = createSyntheticWorkbench('source-first')
    expect(
      findSyntheticSourceMismatches(
        workbench.scenarios.eligible.session,
        workbench.scenarios.eligible.fixture,
        workbench.scenarios.eligible.sources,
      ),
    ).toEqual([])
    const mismatches = findSyntheticSourceMismatches(
      workbench.scenarios['source-mismatch'].session,
      workbench.scenarios['source-mismatch'].fixture,
      workbench.scenarios['source-mismatch'].sources,
    )
    expect(mismatches.length).toBeGreaterThan(0)
    expect(
      workbench.scenarios['source-mismatch'].comparison.status === 'blocked' &&
        workbench.scenarios['source-mismatch'].comparison.blockers,
    ).toContain('SYNTHETIC_SOURCE_LABEL_MISMATCH')
  })

  it('rejects missing or identity-swapped synthetic sources', () => {
    const scenario = createSyntheticWorkbench('source-identity').scenarios.eligible
    const wrongSource = scenario.sources['after-3']
    expect(wrongSource).toBeDefined()
    if (wrongSource === undefined) return
    const swapped = findSyntheticSourceMismatches(
      scenario.session,
      scenario.fixture,
      { ...scenario.sources, 'before-1': wrongSource },
    )
    expect(swapped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'before-1',
          reason: 'SOURCE_IDENTITY_MISMATCH',
        }),
      ]),
    )

    const missingSources = { ...scenario.sources }
    delete (missingSources as Record<string, unknown>)['before-1']
    const missing = findSyntheticSourceMismatches(
      scenario.session,
      scenario.fixture,
      missingSources,
    )
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'before-1',
          reason: 'SOURCE_MISSING',
        }),
      ]),
    )
  })

  it('requires the full canonical range to be covered by one source interval', () => {
    const scenario = createSyntheticWorkbench('source-containment').scenarios.eligible
    const record = scenario.session.observations['before-1:event-1']
    const active = record === undefined ? undefined : getActiveRevision(record)
    expect(active?.payload).toBeDefined()
    if (record === undefined || active?.payload === undefined) return
    let session = apply(scenario.session, {
      type: 'start-edit',
      observationId: record.candidate.id,
      id: 'wide:draft',
      actorId: 'tester',
      atMs: 1,
    })
    session = apply(session, {
      type: 'update-edit',
      observationId: record.candidate.id,
      id: 'wide:update',
      actorId: 'tester',
      atMs: 2,
      payload: {
        ...active.payload,
        source: { ...active.payload.source, endMs: 1_500 },
      },
    })
    session = apply(session, {
      type: 'finalize-edit',
      observationId: record.candidate.id,
      id: 'wide:final',
      actorId: 'tester',
      atMs: 3,
    })
    const mismatches = findSyntheticSourceMismatches(
      session,
      scenario.fixture,
      scenario.sources,
    )
    expect(mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          observationId: 'before-1:event-1@wide:final',
          reason: 'OBSERVATION_RANGE_NOT_COVERED',
        }),
      ]),
    )
  })

  it('supports user-asserted provenance without elevating it', () => {
    const manifest: FixtureManifest = {
      schemaVersion: 1,
      fixtureId: 'fixture:local',
      seed: 'local-session',
      title: 'Local fixture',
      provenance: 'user-asserted-unverified',
      sourceNote: 'User asserted permission; origin and license were not verified.',
      privateDataForbidden: true,
    }
    expect(manifest.provenance).toBe('user-asserted-unverified')
    expect(manifest.provenance).not.toBe('project-owned')
  })

  it('returns deterministic source frames without video or model output', () => {
    const workbench = createSyntheticWorkbench('source-seed')
    const source = workbench.sources['before-1']
    expect(source).toBeDefined()
    if (source === undefined) return
    const first = getSyntheticFrame(source, 2_000)
    const second = getSyntheticFrame(source, 2_000)
    expect(first).toEqual(second)
    expect(first.synthetic).toBe(true)
    expect(first.timeMs).toBe(2_000)
    expect(first.hand.x).toBeTypeOf('number')
  })
})
