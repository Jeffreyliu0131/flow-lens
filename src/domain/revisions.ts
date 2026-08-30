import type {
  CanonicalObservation,
  ObservationRecord,
  ObservationState,
  ReviewRevision,
} from './schema'

export function findRevision(
  record: ObservationRecord,
  revisionId: string | undefined,
): ReviewRevision | undefined {
  if (revisionId === undefined) return undefined
  return record.revisions.find((revision) => revision.id === revisionId)
}

export function getObservationState(record: ObservationRecord): ObservationState {
  const draft = findRevision(record, record.draftRevisionId)
  if (draft !== undefined) return 'edit-draft'
  const active = findRevision(record, record.activeRevisionId)
  return active?.resultingState ?? 'proposed'
}

export function getActiveRevision(
  record: ObservationRecord,
): ReviewRevision | undefined {
  return findRevision(record, record.activeRevisionId)
}

export function getDraftRevision(
  record: ObservationRecord,
): ReviewRevision | undefined {
  return findRevision(record, record.draftRevisionId)
}

export function toCanonicalObservation(
  record: ObservationRecord,
): CanonicalObservation | null {
  const active = getActiveRevision(record)
  if (
    active === undefined ||
    active.payload === undefined ||
    (active.resultingState !== 'confirmed' &&
      active.resultingState !== 'edited-final')
  ) {
    return null
  }

  return {
    id: `${record.candidate.id}@${active.id}`,
    observationId: record.candidate.id,
    activeRevisionId: active.id,
    state: active.resultingState,
    payload: active.payload,
  }
}

export function listCanonicalObservations(
  records: Readonly<Record<string, ObservationRecord>>,
): readonly CanonicalObservation[] {
  return Object.values(records)
    .map(toCanonicalObservation)
    .filter((value): value is CanonicalObservation => value !== null)
}
