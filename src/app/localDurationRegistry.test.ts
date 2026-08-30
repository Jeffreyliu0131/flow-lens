import { describe, expect, it } from 'vitest'
import {
  acceptLocalDuration,
  clearLocalAsset,
  localDurationValues,
  registerLocalAsset,
  type LocalDurationRegistry,
} from './localDurationRegistry'

const snapshot = (beforeId?: string, afterId?: string) => ({
  ...(beforeId ? { before: { slot: 'before' as const, assetId: beforeId, objectUrl: `blob:${beforeId}`, displayName: 'before.webm', mediaType: 'video/webm' } } : {}),
  ...(afterId ? { after: { slot: 'after' as const, assetId: afterId, objectUrl: `blob:${afterId}`, displayName: 'after.webm', mediaType: 'video/webm' } } : {}),
})

describe('local duration registry', () => {
  it('merges Before and After metadata in either order', () => {
    let registry: LocalDurationRegistry = {}
    registry = registerLocalAsset(registry, 'before', 'before-a')
    registry = registerLocalAsset(registry, 'after', 'after-a')
    registry = acceptLocalDuration(registry, 'after', 'after-a', 'after-a', 2_400).registry
    registry = acceptLocalDuration(registry, 'before', 'before-a', 'before-a', 3_100).registry
    expect(localDurationValues(snapshot('before-a', 'after-a'), registry)).toEqual({ before: 3_100, after: 2_400 })
  })

  it('ignores stale metadata after replacement and clears a reset slot', () => {
    let registry: LocalDurationRegistry = registerLocalAsset({}, 'before', 'before-old')
    registry = registerLocalAsset(registry, 'before', 'before-new')
    const stale = acceptLocalDuration(registry, 'before', 'before-new', 'before-old', 9_999)
    expect(stale.accepted).toBe(false)
    expect(localDurationValues(snapshot('before-new'), stale.registry).before).toBe(30_000)
    expect(clearLocalAsset(stale.registry, 'before')).toEqual({})
  })
})
