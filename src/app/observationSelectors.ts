import { getActiveRevision, type ObservationPayload, type ObservationRecord } from '../domain'

export function effectivePayload(record: ObservationRecord): ObservationPayload {
  return getActiveRevision(record)?.payload ?? record.candidate.payload
}
