import { describe, expect, it } from 'vitest'
import {
  applySessionCommand,
  createDomainSession,
  getActiveDecision,
  getActiveHypothesis,
} from './reducer'
import { createVersionedZoneRegistry } from './zones'
import { getObservationState, toCanonicalObservation } from './revisions'
import type {
  CandidateObservation,
  DomainSession,
    ObservationPayload,
    ReviewRevision,
    SessionCommand,
} from './index'

function registry() {
  const result = createVersionedZoneRegistry({
    id: 'zones:test:v1',
    fixtureId: 'fixture:test',
    version: 1,
    zones: [
      { id: 'zone-tape', roleId: 'tape', label: 'Tape', phaseGeometryVersion: 1, x: 0, y: 0, width: 40, height: 40 },
      { id: 'zone-box', roleId: 'box', label: 'Box', phaseGeometryVersion: 1, x: 50, y: 0, width: 40, height: 40 },
    ],
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const payload: ObservationPayload = {
  source: {
    fixtureId: 'fixture:test',
    assetId: 'asset:test',
    runId: 'before-1',
    startMs: 100,
    endMs: 300,
  },
  zoneId: 'zone-tape',
  eventType: 'HAND_ZONE_PRESENCE_INTERVAL',
  eventKind: 'zone-entry',
}

const candidate: CandidateObservation = {
  id: 'event-1',
  payload,
  producer: 'human',
  state: 'proposed',
}

function apply(state: DomainSession, command: SessionCommand): DomainSession {
  const result = applySessionCommand(state, command)
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

describe('immutable observation revisions', () => {
  it('confirms, finalizes an edit, and restores as new revisions', () => {
    const empty = createDomainSession('fixture:test', registry())
    const registered = apply(empty, { type: 'register-candidate', candidate })
    const confirmed = apply(registered, {
      type: 'confirm-observation',
      observationId: candidate.id,
      id: 'revision-confirm',
      actorId: 'operator',
      atMs: 1,
    })

    expect(empty.observations).toEqual({})
    expect(getObservationState(confirmed.observations[candidate.id]!)).toBe(
      'confirmed',
    )

    const editing = apply(confirmed, {
      type: 'start-edit',
      observationId: candidate.id,
      id: 'revision-draft-1',
      actorId: 'operator',
      atMs: 2,
    })
    const updatedPayload: ObservationPayload = {
      ...payload,
      source: { ...payload.source, startMs: 120, endMs: 340 },
      zoneId: 'zone-box',
      eventKind: 'zone-dwell',
    }
    const updated = apply(editing, {
      type: 'update-edit',
      observationId: candidate.id,
      id: 'revision-draft-2',
      actorId: 'operator',
      atMs: 3,
      payload: updatedPayload,
    })
    const finalized = apply(updated, {
      type: 'finalize-edit',
      observationId: candidate.id,
      id: 'revision-final',
      actorId: 'operator',
      atMs: 4,
    })

    const editedRecord = finalized.observations[candidate.id]!
    expect(getObservationState(editedRecord)).toBe('edited-final')
    expect(editedRecord.revisions).toHaveLength(4)
    expect(toCanonicalObservation(editedRecord)?.payload).toEqual(updatedPayload)
    expect(confirmed.observations[candidate.id]!.revisions).toHaveLength(1)

    const restored = apply(finalized, {
      type: 'restore-revision',
      observationId: candidate.id,
      targetRevisionId: 'revision-confirm',
      id: 'revision-restore',
      actorId: 'operator',
      atMs: 5,
    })
    const restoredRecord = restored.observations[candidate.id]!
    expect(restoredRecord.revisions).toHaveLength(5)
    expect(toCanonicalObservation(restoredRecord)?.payload).toEqual(payload)
    expect(restoredRecord.activeRevisionId).toBe('revision-restore')
  })

  it('keeps drafts and rejected/uncertain observations out of canonical state', () => {
    let state = apply(createDomainSession('fixture:test', registry()), {
      type: 'register-candidate',
      candidate,
    })
    state = apply(state, {
      type: 'mark-uncertain',
      observationId: candidate.id,
      id: 'revision-uncertain',
      actorId: 'operator',
      atMs: 1,
    })
    expect(toCanonicalObservation(state.observations[candidate.id]!)).toBeNull()

    state = apply(state, {
      type: 'confirm-observation',
      observationId: candidate.id,
      id: 'revision-confirm',
      actorId: 'operator',
      atMs: 2,
    })
    state = apply(state, {
      type: 'start-edit',
      observationId: candidate.id,
      id: 'revision-draft',
      actorId: 'operator',
      atMs: 3,
    })
    expect(getObservationState(state.observations[candidate.id]!)).toBe('edit-draft')
    expect(toCanonicalObservation(state.observations[candidate.id]!)?.state).toBe(
      'confirmed',
    )
  })

  it('rejects invalid runtime payloads and versions zone changes in domain state', () => {
    const zonesV1 = registry()
    const state = createDomainSession('fixture:test', zonesV1)
    const invalid = {
      ...candidate,
      payload: { ...candidate.payload, eventKind: 'optimized-reach' },
    } as unknown as CandidateObservation
    const rejected = applySessionCommand(state, {
      type: 'register-candidate',
      candidate: invalid,
    })
    expect(rejected.ok).toBe(false)

    const nextRegistryResult = createVersionedZoneRegistry({
      id: 'zones:test:v2',
      fixtureId: 'fixture:test',
      version: 2,
      zones: zonesV1.zones.map((zone) =>
        zone.id === 'zone-tape' ? { ...zone, width: zone.width - 5 } : zone,
      ),
    })
    if (!nextRegistryResult.ok) throw new Error(nextRegistryResult.error.message)
    const changed = applySessionCommand(state, {
      type: 'replace-zone-registry',
      zoneRegistry: nextRegistryResult.value,
    })
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    expect(changed.value.zoneRegistry.version).toBe(2)
    expect(changed.value.zoneRegistry.geometryFingerprint).not.toBe(
      zonesV1.geometryFingerprint,
    )
  })

  it('does not allow an edit to move evidence to another run or source asset', () => {
    let state = apply(createDomainSession('fixture:test', registry()), {
      type: 'register-candidate',
      candidate,
    })
    state = apply(state, {
      type: 'confirm-observation',
      observationId: candidate.id,
      id: 'revision-confirm',
      actorId: 'operator',
      atMs: 1,
    })
    state = apply(state, {
      type: 'start-edit',
      observationId: candidate.id,
      id: 'revision-draft',
      actorId: 'operator',
      atMs: 2,
    })

    for (const changedSource of [
      { ...payload.source, fixtureId: 'fixture:other' },
      { ...payload.source, runId: 'after-1' },
      { ...payload.source, assetId: 'asset:other' },
    ]) {
      const result = applySessionCommand(state, {
        type: 'update-edit',
        observationId: candidate.id,
        id: `revision-update-${changedSource.runId}-${changedSource.assetId}`,
        actorId: 'operator',
        atMs: 3,
        payload: { ...payload, source: changedSource },
      })
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'EDIT_SOURCE_BINDING_MISMATCH' },
      })
      if (!result.ok) {
        expect(state.revisionOrder).not.toContain(
          `revision-update-${changedSource.runId}-${changedSource.assetId}`,
        )
      }
    }
  })

  it('does not restore a forged canonical revision with another source binding', () => {
    let state = apply(createDomainSession('fixture:test', registry()), {
      type: 'register-candidate',
      candidate,
    })
    state = apply(state, {
      type: 'confirm-observation',
      observationId: candidate.id,
      id: 'revision-confirm',
      actorId: 'operator',
      atMs: 1,
    })
    const record = state.observations[candidate.id]!
    const forged: ReviewRevision = {
      id: 'revision-forged',
      observationId: candidate.id,
      action: 'finalize-edit',
      actorId: 'forged-actor',
      createdAtMs: 2,
      resultingState: 'edited-final',
      payload: {
        ...payload,
        source: { ...payload.source, assetId: 'asset:other' },
      },
      previousRevisionId: 'revision-confirm',
    }
    const forgedState: DomainSession = {
      ...state,
      observations: {
        ...state.observations,
        [candidate.id]: {
          ...record,
          revisions: [...record.revisions, forged],
        },
      },
      revisionOrder: [...state.revisionOrder, forged.id],
    }
    const result = applySessionCommand(forgedState, {
      type: 'restore-revision',
      observationId: candidate.id,
      targetRevisionId: forged.id,
      id: 'revision-restore-forged',
      actorId: 'operator',
      atMs: 3,
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'EDIT_SOURCE_BINDING_MISMATCH' },
    })
  })
})

describe('one hypothesis and decision boundary', () => {
  it('requires a locked hypothesis and clears the active decision on a new draft', () => {
    let state = createDomainSession('fixture:test', registry())
    const premature = applySessionCommand(state, {
      type: 'set-decision',
      id: 'decision-early',
      actorId: 'operator',
      atMs: 1,
      outcome: 'keep',
    })
    expect(premature.ok).toBe(false)

    state = apply(state, {
      type: 'set-hypothesis-draft',
      id: 'hypothesis-draft',
      actorId: 'operator',
      atMs: 2,
      text: 'Move the synthetic tape zone.',
    })
    state = apply(state, {
      type: 'lock-hypothesis',
      id: 'hypothesis-locked',
      actorId: 'operator',
      atMs: 3,
    })
    state = apply(state, {
      type: 'set-decision',
      id: 'decision-1',
      actorId: 'operator',
      atMs: 4,
      outcome: 'uncertain',
      claimEvidenceFingerprint: 'claim-fingerprint-v1',
    })
    expect(getActiveHypothesis(state)?.status).toBe('locked')
    expect(getActiveDecision(state)?.outcome).toBe('uncertain')
    expect(getActiveDecision(state)?.claimEvidenceFingerprint).toBe(
      'claim-fingerprint-v1',
    )

    const revised = apply(state, {
      type: 'set-hypothesis-draft',
      id: 'hypothesis-draft-2',
      actorId: 'operator',
      atMs: 5,
      text: 'Try a different synthetic tape position.',
    })
    expect(getActiveHypothesis(revised)?.status).toBe('draft')
    expect(getActiveDecision(revised)).toBeUndefined()
    expect(revised.decisions).toHaveLength(1)
  })

  it('rejects decisions without a non-empty claim evidence fingerprint', () => {
    let state = createDomainSession('fixture:test', registry())
    state = apply(state, {
      type: 'set-hypothesis-draft',
      id: 'hypothesis-draft',
      actorId: 'operator',
      atMs: 1,
      text: 'Try one reversible change.',
    })
    state = apply(state, {
      type: 'lock-hypothesis',
      id: 'hypothesis-locked',
      actorId: 'operator',
      atMs: 2,
    })

    for (const claimEvidenceFingerprint of [undefined, '', '   ']) {
      const result = applySessionCommand(state, {
        type: 'set-decision',
        id: `decision-${String(claimEvidenceFingerprint)}`,
        actorId: 'operator',
        atMs: 3,
        outcome: 'keep',
        ...(claimEvidenceFingerprint === undefined
          ? {}
          : { claimEvidenceFingerprint }),
      })
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'CLAIM_EVIDENCE_FINGERPRINT_REQUIRED' },
      })
    }
  })

  it('rejects a runtime-forged decision outcome', () => {
    let state = createDomainSession('fixture:test', registry())
    state = apply(state, {
      type: 'set-hypothesis-draft',
      id: 'hypothesis-draft-invalid-outcome',
      actorId: 'operator',
      atMs: 1,
      text: 'Try one reversible change.',
    })
    state = apply(state, {
      type: 'lock-hypothesis',
      id: 'hypothesis-locked-invalid-outcome',
      actorId: 'operator',
      atMs: 2,
    })
    const result = applySessionCommand(state, {
      type: 'set-decision',
      id: 'decision-invalid-outcome',
      actorId: 'operator',
      atMs: 3,
      outcome: 'ship-it',
      claimEvidenceFingerprint: 'claim-fingerprint-v1',
    } as unknown as SessionCommand)
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_DECISION_OUTCOME' },
    })
  })
})
