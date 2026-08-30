import { err, ok, type DomainResult } from './result'
import type {
  DecisionOutcome,
  EventKind,
  ObservationPayload,
  ObservationType,
  VersionedZoneRegistry,
} from './schema'
import { hasZone } from './zones'

const OBSERVATION_TYPES: readonly ObservationType[] = [
  'HAND_ZONE_PRESENCE_INTERVAL',
  'VISIBLE_CONTACT',
]
const EVENT_KINDS: readonly EventKind[] = [
  'zone-entry',
  'zone-dwell',
  'zone-revisit',
]
const DECISION_OUTCOMES: readonly DecisionOutcome[] = [
  'keep',
  'revert',
  'uncertain',
]

export function isObservationType(value: unknown): value is ObservationType {
  return typeof value === 'string' && OBSERVATION_TYPES.includes(value as ObservationType)
}

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === 'string' && EVENT_KINDS.includes(value as EventKind)
}

export function isDecisionOutcome(value: unknown): value is DecisionOutcome {
  return (
    typeof value === 'string' &&
    DECISION_OUTCOMES.includes(value as DecisionOutcome)
  )
}

export function validateObservationPayload(
  payload: ObservationPayload,
  registry: VersionedZoneRegistry,
): DomainResult<ObservationPayload> {
  const { source } = payload
  if (
    !Number.isFinite(source.startMs) ||
    !Number.isFinite(source.endMs) ||
    source.startMs < 0 ||
    source.startMs >= source.endMs
  ) {
    return err('INVALID_OBSERVATION_RANGE', 'Observation range must be finite and ordered')
  }
  if (
    source.fixtureId !== registry.fixtureId ||
    source.fixtureId.trim().length === 0 ||
    source.assetId.trim().length === 0 ||
    source.runId.trim().length === 0
  ) {
    return err('OBSERVATION_SOURCE_MISMATCH', 'Observation source is not bound to this fixture')
  }
  if (!isObservationType(payload.eventType)) {
    return err('INVALID_OBSERVATION_TYPE', 'Observation type is not allowed')
  }
  if (!isEventKind(payload.eventKind)) {
    return err('INVALID_EVENT_KIND', 'Event kind is not allowed')
  }
  if (!hasZone(registry, payload.zoneId)) {
    return err('UNKNOWN_ZONE', 'Observation zone is not in the active registry')
  }
  return ok(payload)
}
