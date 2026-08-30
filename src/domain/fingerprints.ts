import type {
  IncludedMetricEvidence,
  WorkUnitSignature,
  ZoneDefinition,
} from './schema'

function fnv1a(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function fingerprintWorkUnitSignature(
  signature: WorkUnitSignature,
): string {
  return fnv1a(
    JSON.stringify({
      skuAlias: normalizeText(signature.skuAlias),
      taskBoundary: normalizeText(signature.taskBoundary),
      materials: [...signature.materials].map(normalizeText).sort(),
      completionRule: normalizeText(signature.completionRule),
      version: signature.version,
    }),
  )
}

export function fingerprintZoneGeometry(
  zones: readonly ZoneDefinition[],
): string {
  const normalized = [...zones]
    .map((zone) => ({
      id: zone.id,
      roleId: normalizeText(zone.roleId),
      label: normalizeText(zone.label),
      phaseGeometryVersion: zone.phaseGeometryVersion,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  return fnv1a(JSON.stringify(normalized))
}

export function fingerprintIncludedMetrics(
  metrics: readonly IncludedMetricEvidence[],
): string {
  const normalized = [...metrics]
    .map((metric) => ({
      ...metric,
      canonicalObservationIds: [...metric.canonicalObservationIds],
      activeRevisionIds: [...metric.activeRevisionIds],
    }))
    .sort((left, right) => left.metricId.localeCompare(right.metricId))
  return fnv1a(JSON.stringify(normalized))
}
