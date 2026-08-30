import { err, ok, type DomainResult } from './result'
import { isDecisionOutcome, validateObservationPayload } from './invariants'
import {
  findRevision,
  getActiveRevision,
  getDraftRevision,
} from './revisions'
import type {
  CandidateObservation,
  DecisionOutcome,
  DecisionRecord,
  DomainSession,
  HypothesisState,
  HypothesisVersion,
  ObservationPayload,
  ObservationRecord,
  ObservationState,
  ReviewAction,
  ReviewRevision,
  VersionedZoneRegistry,
} from './schema'
import { createVersionedZoneRegistry } from './zones'

interface CommandMeta {
  readonly id: string
  readonly actorId: string
  readonly atMs: number
}

export type SessionCommand =
  | { readonly type: 'register-candidate'; readonly candidate: CandidateObservation }
  | { readonly type: 'replace-zone-registry'; readonly zoneRegistry: VersionedZoneRegistry }
  | ({ readonly type: 'confirm-observation'; readonly observationId: string } & CommandMeta)
  | ({ readonly type: 'reject-observation'; readonly observationId: string; readonly reason?: string } & CommandMeta)
  | ({ readonly type: 'mark-uncertain'; readonly observationId: string; readonly reason?: string } & CommandMeta)
  | ({ readonly type: 'start-edit'; readonly observationId: string } & CommandMeta)
  | ({ readonly type: 'update-edit'; readonly observationId: string; readonly payload: ObservationPayload } & CommandMeta)
  | ({ readonly type: 'cancel-edit'; readonly observationId: string } & CommandMeta)
  | ({ readonly type: 'finalize-edit'; readonly observationId: string } & CommandMeta)
  | ({ readonly type: 'restore-revision'; readonly observationId: string; readonly targetRevisionId: string } & CommandMeta)
  | ({ readonly type: 'set-hypothesis-draft'; readonly text: string } & CommandMeta)
  | ({ readonly type: 'lock-hypothesis' } & CommandMeta)
  | ({
      readonly type: 'set-decision'
      readonly outcome: DecisionOutcome
      /**
       * Optional at the type boundary for compatibility with older callers.
       * The reducer rejects a missing or blank value and never creates a
       * DecisionRecord without an evidence fingerprint.
       */
      readonly claimEvidenceFingerprint?: string
    } & CommandMeta)

export function createDomainSession(
  fixtureId: string,
  zoneRegistry: VersionedZoneRegistry,
): DomainSession {
  if (zoneRegistry.fixtureId !== fixtureId) {
    throw new Error('Zone registry fixture does not match session fixture')
  }
  return {
    fixtureId,
    zoneRegistry,
    observations: {},
    revisionOrder: [],
    hypothesis: { versions: [] },
    decisions: [],
    version: 0,
  }
}

function hasRevisionId(state: DomainSession, revisionId: string): boolean {
  return state.revisionOrder.includes(revisionId)
}

function copyRecord(
  record: ObservationRecord,
  revisions: readonly ReviewRevision[],
  activeRevisionId?: string,
  draftRevisionId?: string,
): ObservationRecord {
  const next: {
    candidate: CandidateObservation
    revisions: readonly ReviewRevision[]
    activeRevisionId?: string
    draftRevisionId?: string
  } = { candidate: record.candidate, revisions }
  if (activeRevisionId !== undefined) next.activeRevisionId = activeRevisionId
  if (draftRevisionId !== undefined) next.draftRevisionId = draftRevisionId
  return next
}

function replaceRecord(
  state: DomainSession,
  observationId: string,
  record: ObservationRecord,
  revisionId?: string,
): DomainSession {
  return {
    ...state,
    observations: { ...state.observations, [observationId]: record },
    revisionOrder:
      revisionId === undefined
        ? state.revisionOrder
        : [...state.revisionOrder, revisionId],
    version: state.version + 1,
  }
}

function appendRevision(
  state: DomainSession,
  observationId: string,
  revision: ReviewRevision,
  activeRevisionId?: string,
  draftRevisionId?: string,
): DomainResult<DomainSession> {
  if (hasRevisionId(state, revision.id)) {
    return err('DUPLICATE_REVISION_ID', 'Revision ID already exists', {
      revisionId: revision.id,
    })
  }
  const record = state.observations[observationId]
  if (record === undefined) {
    return err('OBSERVATION_NOT_FOUND', 'Observation does not exist', {
      observationId,
    })
  }
  return ok(
    replaceRecord(
      state,
      observationId,
      copyRecord(
        record,
        [...record.revisions, revision],
        activeRevisionId,
        draftRevisionId,
      ),
      revision.id,
    ),
  )
}

function makeRevision(
  observationId: string,
  action: ReviewAction,
  resultingState: ObservationState,
  meta: CommandMeta,
  options: {
    readonly payload?: ObservationPayload | undefined
    readonly previousRevisionId?: string | undefined
    readonly draftRevisionId?: string | undefined
    readonly targetRevisionId?: string | undefined
    readonly reason?: string | undefined
  } = {},
): ReviewRevision {
  const revision: {
    id: string
    observationId: string
    action: ReviewAction
    actorId: string
    createdAtMs: number
    resultingState: ObservationState
    payload?: ObservationPayload
    previousRevisionId?: string
    draftRevisionId?: string
    targetRevisionId?: string
    reason?: string
  } = {
    id: meta.id,
    observationId,
    action,
    actorId: meta.actorId,
    createdAtMs: meta.atMs,
    resultingState,
  }
  if (options.payload !== undefined) revision.payload = options.payload
  if (options.previousRevisionId !== undefined) {
    revision.previousRevisionId = options.previousRevisionId
  }
  if (options.draftRevisionId !== undefined) {
    revision.draftRevisionId = options.draftRevisionId
  }
  if (options.targetRevisionId !== undefined) {
    revision.targetRevisionId = options.targetRevisionId
  }
  if (options.reason !== undefined) revision.reason = options.reason
  return revision
}

function stateAfterCancel(record: ObservationRecord): ObservationState {
  return getActiveRevision(record)?.resultingState ?? 'proposed'
}

function hasCandidateSourceBinding(
  record: ObservationRecord,
  payload: ObservationPayload,
): boolean {
  const candidateSource = record.candidate.payload.source
  return (
    payload.source.fixtureId === candidateSource.fixtureId &&
    payload.source.runId === candidateSource.runId &&
    payload.source.assetId === candidateSource.assetId
  )
}

function sourceBindingError(): DomainResult<never> {
  return err(
    'EDIT_SOURCE_BINDING_MISMATCH',
    'An edit cannot move an observation to another fixture, run, or source asset',
  )
}

function withHypothesis(
  state: DomainSession,
  hypothesis: HypothesisState,
): DomainSession {
  // A new hypothesis version invalidates the active decision but preserves history.
  return {
    fixtureId: state.fixtureId,
    zoneRegistry: state.zoneRegistry,
    observations: state.observations,
    revisionOrder: state.revisionOrder,
    hypothesis,
    decisions: state.decisions,
    version: state.version + 1,
  }
}

function activeHypothesis(state: DomainSession): HypothesisVersion | undefined {
  const id = state.hypothesis.activeVersionId
  return id === undefined
    ? undefined
    : state.hypothesis.versions.find((version) => version.id === id)
}

export function applySessionCommand(
  state: DomainSession,
  command: SessionCommand,
): DomainResult<DomainSession> {
  if (command.type === 'register-candidate') {
    if (state.observations[command.candidate.id] !== undefined) {
      return err('DUPLICATE_OBSERVATION_ID', 'Observation ID already exists', {
        observationId: command.candidate.id,
      })
    }
    const payloadValidation = validateObservationPayload(
      command.candidate.payload,
      state.zoneRegistry,
    )
    if (!payloadValidation.ok || command.candidate.state !== 'proposed') {
      return payloadValidation.ok
        ? err('INVALID_CANDIDATE_STATE', 'Candidate must be proposed')
        : err(payloadValidation.error.code, payloadValidation.error.message)
    }
    const storedCandidate: CandidateObservation = command.candidate.confidence === undefined
      ? {
          ...command.candidate,
          payload: {
            ...command.candidate.payload,
            source: { ...command.candidate.payload.source },
          },
        }
      : {
          ...command.candidate,
          payload: {
            ...command.candidate.payload,
            source: { ...command.candidate.payload.source },
          },
          confidence: command.candidate.confidence,
        }
    return ok(
      replaceRecord(state, command.candidate.id, {
        candidate: storedCandidate,
        revisions: [],
      }),
    )
  }

  if (command.type === 'replace-zone-registry') {
    const validation = createVersionedZoneRegistry(command.zoneRegistry)
    if (!validation.ok) return err(validation.error.code, validation.error.message)
    if (
      validation.value.fixtureId !== state.fixtureId ||
      validation.value.geometryFingerprint !== command.zoneRegistry.geometryFingerprint
    ) {
      return err('ZONE_REGISTRY_MISMATCH', 'Zone registry is not bound to this session')
    }
    if (validation.value.version <= state.zoneRegistry.version) {
      return err('ZONE_REGISTRY_VERSION_STALE', 'Zone registry version must increase')
    }
    return ok({
      ...state,
      zoneRegistry: validation.value,
      version: state.version + 1,
    })
  }

  if (command.type === 'set-hypothesis-draft') {
    const text = command.text.trim()
    if (text.length === 0) {
      return err('EMPTY_HYPOTHESIS', 'Hypothesis text cannot be empty')
    }
    if (state.hypothesis.versions.some((version) => version.id === command.id)) {
      return err('DUPLICATE_HYPOTHESIS_ID', 'Hypothesis version ID exists')
    }
    const previous = activeHypothesis(state)
    const version: HypothesisVersion = previous === undefined
      ? {
          id: command.id,
          text,
          status: 'draft',
          actorId: command.actorId,
          createdAtMs: command.atMs,
        }
      : {
          id: command.id,
          text,
          status: 'draft',
          actorId: command.actorId,
          createdAtMs: command.atMs,
          previousVersionId: previous.id,
        }
    return ok(
      withHypothesis(state, {
        versions: [...state.hypothesis.versions, version],
        activeVersionId: version.id,
      }),
    )
  }

  if (command.type === 'lock-hypothesis') {
    const current = activeHypothesis(state)
    if (current === undefined || current.status !== 'draft') {
      return err('HYPOTHESIS_NOT_DRAFT', 'Only an active draft can be locked')
    }
    if (state.hypothesis.versions.some((version) => version.id === command.id)) {
      return err('DUPLICATE_HYPOTHESIS_ID', 'Hypothesis version ID exists')
    }
    const locked: HypothesisVersion = {
      id: command.id,
      text: current.text,
      status: 'locked',
      actorId: command.actorId,
      createdAtMs: command.atMs,
      previousVersionId: current.id,
    }
    return ok(
      withHypothesis(state, {
        versions: [...state.hypothesis.versions, locked],
        activeVersionId: locked.id,
      }),
    )
  }

  if (command.type === 'set-decision') {
    const hypothesis = activeHypothesis(state)
    if (hypothesis === undefined || hypothesis.status !== 'locked') {
      return err('HYPOTHESIS_NOT_LOCKED', 'Decision requires a locked hypothesis')
    }
    const claimEvidenceFingerprint = command.claimEvidenceFingerprint?.trim()
    if (claimEvidenceFingerprint === undefined || claimEvidenceFingerprint.length === 0) {
      return err(
        'CLAIM_EVIDENCE_FINGERPRINT_REQUIRED',
        'Decision requires the current non-empty claim evidence fingerprint',
      )
    }
    if (!isDecisionOutcome(command.outcome)) {
      return err(
        'INVALID_DECISION_OUTCOME',
        'Decision outcome must be keep, revert, or uncertain',
      )
    }
    if (state.decisions.some((decision) => decision.id === command.id)) {
      return err('DUPLICATE_DECISION_ID', 'Decision ID already exists')
    }
    const decision: DecisionRecord = {
      id: command.id,
      hypothesisVersionId: hypothesis.id,
      claimEvidenceFingerprint,
      outcome: command.outcome,
      actorId: command.actorId,
      createdAtMs: command.atMs,
    }
    return ok({
      ...state,
      decisions: [...state.decisions, decision],
      activeDecisionId: decision.id,
      version: state.version + 1,
    })
  }

  const record = state.observations[command.observationId]
  if (record === undefined) {
    return err('OBSERVATION_NOT_FOUND', 'Observation does not exist', {
      observationId: command.observationId,
    })
  }
  const active = getActiveRevision(record)
  const draft = getDraftRevision(record)
  const previousRevisionId = active?.id

  if (command.type === 'confirm-observation') {
    if (draft !== undefined) {
      return err('DRAFT_IN_PROGRESS', 'Finalize or cancel the draft first')
    }
    const payloadValidation = validateObservationPayload(
      record.candidate.payload,
      state.zoneRegistry,
    )
    if (!payloadValidation.ok) {
      return err(payloadValidation.error.code, payloadValidation.error.message)
    }
    const revision = makeRevision(
      command.observationId,
      'confirm',
      'confirmed',
      command,
      { payload: record.candidate.payload, previousRevisionId },
    )
    return appendRevision(state, command.observationId, revision, revision.id)
  }

  if (command.type === 'reject-observation' || command.type === 'mark-uncertain') {
    if (draft !== undefined) {
      return err('DRAFT_IN_PROGRESS', 'Finalize or cancel the draft first')
    }
    const isReject = command.type === 'reject-observation'
    const revision = makeRevision(
      command.observationId,
      isReject ? 'reject' : 'uncertain',
      isReject ? 'rejected' : 'uncertain',
      command,
      { previousRevisionId, reason: command.reason },
    )
    return appendRevision(state, command.observationId, revision, revision.id)
  }

  if (command.type === 'start-edit') {
    if (draft !== undefined) {
      return err('DRAFT_IN_PROGRESS', 'An edit draft already exists')
    }
    if (
      active === undefined ||
      active.payload === undefined ||
      (active.resultingState !== 'confirmed' &&
        active.resultingState !== 'edited-final')
    ) {
      return err('EDIT_REQUIRES_CANONICAL', 'Only canonical evidence can be edited')
    }
    const revision = makeRevision(
      command.observationId,
      'edit-draft',
      'edit-draft',
      command,
      { payload: active.payload, previousRevisionId: active.id },
    )
    return appendRevision(
      state,
      command.observationId,
      revision,
      active.id,
      revision.id,
    )
  }

  if (command.type === 'update-edit') {
    if (draft === undefined) {
      return err('EDIT_DRAFT_NOT_FOUND', 'Start an edit before updating it')
    }
    if (!hasCandidateSourceBinding(record, command.payload)) {
      return sourceBindingError()
    }
    const payloadValidation = validateObservationPayload(
      command.payload,
      state.zoneRegistry,
    )
    if (!payloadValidation.ok) {
      return err(payloadValidation.error.code, payloadValidation.error.message)
    }
    const revision = makeRevision(
      command.observationId,
      'edit-draft',
      'edit-draft',
      command,
      { payload: command.payload, previousRevisionId: draft.id },
    )
    return appendRevision(
      state,
      command.observationId,
      revision,
      record.activeRevisionId,
      revision.id,
    )
  }

  if (command.type === 'cancel-edit') {
    if (draft === undefined) {
      return err('EDIT_DRAFT_NOT_FOUND', 'There is no edit draft to cancel')
    }
    const revision = makeRevision(
      command.observationId,
      'cancel-edit',
      stateAfterCancel(record),
      command,
      { previousRevisionId: draft.id },
    )
    return appendRevision(
      state,
      command.observationId,
      revision,
      record.activeRevisionId,
    )
  }

  if (command.type === 'finalize-edit') {
    if (draft === undefined || draft.payload === undefined) {
      return err('EDIT_DRAFT_NOT_FOUND', 'There is no complete edit draft')
    }
    if (!hasCandidateSourceBinding(record, draft.payload)) {
      return sourceBindingError()
    }
    const payloadValidation = validateObservationPayload(
      draft.payload,
      state.zoneRegistry,
    )
    if (!payloadValidation.ok) {
      return err(payloadValidation.error.code, payloadValidation.error.message)
    }
    const revision = makeRevision(
      command.observationId,
      'finalize-edit',
      'edited-final',
      command,
      {
        payload: draft.payload,
        previousRevisionId,
        draftRevisionId: draft.id,
      },
    )
    return appendRevision(state, command.observationId, revision, revision.id)
  }

  if (command.type === 'restore-revision') {
    if (draft !== undefined) {
      return err('DRAFT_IN_PROGRESS', 'Finalize or cancel the draft first')
    }
    const target = findRevision(record, command.targetRevisionId)
    if (
      target === undefined ||
      target.payload === undefined ||
      (target.resultingState !== 'confirmed' &&
        target.resultingState !== 'edited-final')
    ) {
      return err('RESTORE_TARGET_INVALID', 'Restore target is not canonical')
    }
    if (!hasCandidateSourceBinding(record, target.payload)) {
      return sourceBindingError()
    }
    const payloadValidation = validateObservationPayload(
      target.payload,
      state.zoneRegistry,
    )
    if (!payloadValidation.ok) {
      return err(payloadValidation.error.code, payloadValidation.error.message)
    }
    const revision = makeRevision(
      command.observationId,
      'restore',
      target.resultingState,
      command,
      {
        payload: target.payload,
        previousRevisionId,
        targetRevisionId: target.id,
      },
    )
    return appendRevision(state, command.observationId, revision, revision.id)
  }

  return err('UNKNOWN_COMMAND', 'Unsupported session command')
}

export function getActiveHypothesis(
  state: DomainSession,
): HypothesisVersion | undefined {
  return activeHypothesis(state)
}

export function getActiveDecision(
  state: DomainSession,
): DecisionRecord | undefined {
  const id = state.activeDecisionId
  return id === undefined
    ? undefined
    : state.decisions.find((decision) => decision.id === id)
}
