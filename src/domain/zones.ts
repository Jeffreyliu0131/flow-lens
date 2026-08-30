import { fingerprintZoneGeometry } from './fingerprints'
import { err, ok, type DomainResult } from './result'
import type { VersionedZoneRegistry, ZoneDefinition } from './schema'

export interface ZoneRegistryInput {
  readonly id: string
  readonly fixtureId: string
  readonly version: number
  readonly zones: readonly ZoneDefinition[]
}

export function zoneIsValid(zone: ZoneDefinition): boolean {
  return (
    zone.id.trim().length > 0 &&
    zone.roleId.trim().length > 0 &&
    Number.isInteger(zone.phaseGeometryVersion) &&
    zone.phaseGeometryVersion > 0 &&
    [zone.x, zone.y, zone.width, zone.height].every(Number.isFinite) &&
    zone.x >= 0 &&
    zone.y >= 0 &&
    zone.width > 0 &&
    zone.height > 0 &&
    zone.x + zone.width <= 100 &&
    zone.y + zone.height <= 100
  )
}

export function createVersionedZoneRegistry(
  input: ZoneRegistryInput,
): DomainResult<VersionedZoneRegistry> {
  if (
    input.id.trim().length === 0 ||
    input.fixtureId.trim().length === 0 ||
    !Number.isInteger(input.version) ||
    input.version <= 0
  ) {
    return err('INVALID_ZONE_REGISTRY', 'Zone registry identity/version is invalid')
  }
  if (input.zones.length === 0 || !input.zones.every(zoneIsValid)) {
    return err('INVALID_ZONE_GEOMETRY', 'Every zone must have finite normalized geometry')
  }
  const zoneIds = input.zones.map((zone) => zone.id)
  if (new Set(zoneIds).size !== zoneIds.length) {
    return err('DUPLICATE_ZONE_ID', 'Zone IDs must be unique')
  }
  const zones = Object.freeze(
    input.zones.map((zone) => Object.freeze({ ...zone })),
  )
  return ok(Object.freeze({
    id: input.id,
    fixtureId: input.fixtureId,
    version: input.version,
    zones,
    geometryFingerprint: fingerprintZoneGeometry(zones),
  }))
}

export function hasZone(
  registry: VersionedZoneRegistry,
  zoneId: string,
): boolean {
  return registry.zones.some((zone) => zone.id === zoneId)
}
