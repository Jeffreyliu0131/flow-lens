import { describe, expect, it } from 'vitest'
import { createSyntheticWorkbench } from '../fixtures'
import { deriveEvidence } from './derive'

describe('workspace evidence derivation', () => {
  it('keeps the eligible synthetic source and review labels comparable', () => {
    const scenario = createSyntheticWorkbench().scenarios.eligible
    const derived = deriveEvidence(scenario.fixture, scenario.session, {
      expectedProvenance: 'synthetic',
      syntheticSources: scenario.sources,
    })
    expect(derived.comparison.status).toBe('shown')
    expect(derived.claim).toBeDefined()
  })

  it('blocks source-label mismatch in the shared derivation path', () => {
    const scenario = createSyntheticWorkbench().scenarios['source-mismatch']
    const derived = deriveEvidence(scenario.fixture, scenario.session, {
      expectedProvenance: 'synthetic',
      syntheticSources: scenario.sources,
    })
    expect(derived.comparison).toMatchObject({
      status: 'blocked',
      blockers: ['SYNTHETIC_SOURCE_LABEL_MISMATCH'],
    })
    if (derived.comparison.status !== 'blocked') return
    expect(derived.comparison.affectedRunIds.length).toBeGreaterThan(0)
    expect(derived.claim).toBeUndefined()
  })

  it('preserves run-level coverage blockers in the comparison result', () => {
    const scenario = createSyntheticWorkbench().scenarios['coverage-gap']
    const derived = deriveEvidence(scenario.fixture, scenario.session, {
      expectedProvenance: 'synthetic',
      syntheticSources: scenario.sources,
    })
    expect(derived.comparison.status).toBe('blocked')
    if (derived.comparison.status !== 'blocked') return
    expect(derived.comparison.blockers).toEqual(
      expect.arrayContaining([
        'UNKNOWN_INTERVALS_PRESENT',
        'UNREVIEWED_INTERVALS_PRESENT',
        'MISSING_RUN_METRIC',
      ]),
    )
    expect(derived.comparison.affectedRunIds).toContain('after-3')
  })

  it('blocks fixture/session/schema/provenance mismatch before any metric or claim', () => {
    const scenario = createSyntheticWorkbench().scenarios.eligible
    const forgedFixture = {
      ...scenario.fixture,
      manifest: {
        ...scenario.fixture.manifest,
        fixtureId: 'fixture:unrelated',
        provenance: 'project-owned' as const,
      },
    }
    const derived = deriveEvidence(forgedFixture, scenario.session, {
      expectedProvenance: 'synthetic',
      syntheticSources: scenario.sources,
    })
    expect(derived.metrics).toEqual({})
    expect(derived.computedMetrics).toEqual([])
    expect(derived.claim).toBeUndefined()
    expect(derived.comparison).toMatchObject({
      status: 'blocked',
      blockers: ['WORKSPACE_FIXTURE_INTEGRITY_MISMATCH'],
    })
    expect(derived.error).toContain('integrity mismatch')
  })
})
