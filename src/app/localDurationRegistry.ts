import type { LocalMediaSnapshot, MediaSlot } from '../adapters'

export const DEFAULT_LOCAL_DURATION_MS = 30_000

export interface LocalDurationRecord {
  readonly assetId: string
  readonly durationMs: number
}

export type LocalDurationRegistry = Partial<Record<MediaSlot, LocalDurationRecord>>

export function registerLocalAsset(
  registry: LocalDurationRegistry,
  slot: MediaSlot,
  assetId: string,
): LocalDurationRegistry {
  return { ...registry, [slot]: { assetId, durationMs: DEFAULT_LOCAL_DURATION_MS } }
}

export function clearLocalAsset(
  registry: LocalDurationRegistry,
  slot: MediaSlot,
): LocalDurationRegistry {
  const next = { ...registry }
  delete next[slot]
  return next
}

export function acceptLocalDuration(
  registry: LocalDurationRegistry,
  slot: MediaSlot,
  currentAssetId: string | undefined,
  eventAssetId: string,
  durationMs: number,
): { readonly registry: LocalDurationRegistry; readonly accepted: boolean } {
  if (
    currentAssetId !== eventAssetId ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return { registry, accepted: false }
  }
  return {
    registry: {
      ...registry,
      [slot]: { assetId: eventAssetId, durationMs: Math.round(durationMs) },
    },
    accepted: true,
  }
}

export function localDurationValues(
  snapshot: LocalMediaSnapshot,
  registry: LocalDurationRegistry,
): Readonly<Record<MediaSlot, number>> {
  const valueFor = (slot: MediaSlot) => {
    const handle = snapshot[slot]
    const record = registry[slot]
    return handle !== undefined && record?.assetId === handle.assetId
      ? record.durationMs
      : DEFAULT_LOCAL_DURATION_MS
  }
  return { before: valueFor('before'), after: valueFor('after') }
}
