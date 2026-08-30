import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getActiveDecision, getActiveHypothesis } from '../domain'
import { usePrototype } from './usePrototype'

afterEach(() => cleanup())

describe('prototype controller experience gates', () => {
  it('rejects hypothesis and decision commands before review, then binds the decision to the current claim', async () => {
    const { result } = renderHook(() => usePrototype())
    act(() => result.current.loadSynthetic('eligible'))
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    let earlyHypothesis = true
    let earlyDecision = true
    act(() => {
      earlyHypothesis = result.current.setHypothesis('Premature change')
      earlyDecision = result.current.setDecision('keep')
    })
    expect(earlyHypothesis).toBe(false)
    expect(earlyDecision).toBe(false)
    expect(result.current.session && getActiveHypothesis(result.current.session)).toBeUndefined()

    act(() => result.current.acknowledgeExperienceScope())
    for (const run of result.current.fixture?.runs ?? []) {
      act(() => result.current.markRunExperienceReviewed(run.id))
    }
    act(() => {
      result.current.dispatch(
        {
          type: 'confirm-observation',
          observationId: 'before-1:low-confidence',
          id: 'controller-test:confirm',
          actorId: 'controller-test',
          atMs: 1,
        },
        'confirmed for controller test',
      )
    })

    let hypothesisLocked = false
    act(() => {
      hypothesisLocked = result.current.setHypothesis(
        '把合成胶带区移近纸箱，并保持其他条件不变。',
      )
    })
    expect(hypothesisLocked).toBe(true)

    let decisionRecorded = false
    act(() => {
      decisionRecorded = result.current.setDecision('keep')
    })
    expect(decisionRecorded).toBe(true)
    const session = result.current.session
    const decision = session === null ? undefined : getActiveDecision(session)
    expect(decision?.outcome).toBe('keep')
    expect(decision?.claimEvidenceFingerprint).toMatch(/^[0-9a-f]{8}$/)
  })
})
