import { describe, expect, it, vi } from 'vitest'
import type { RunRecord, WorkUnitSignature } from '../domain'
import { LocalMediaSession } from './media/LocalMediaSession'
import { NullAdapter } from './model/NullAdapter'

const signature: WorkUnitSignature = {
  id: 'sig',
  skuAlias: 'SKU',
  taskBoundary: 'one parcel',
  materials: [],
  completionRule: 'closed',
  version: 1,
}

const run: RunRecord = {
  id: 'run',
  label: 'Run',
  phase: 'before',
  order: 1,
  durationMs: 1_000,
  source: {
    fixtureId: 'fixture',
    assetId: 'asset',
    runId: 'run',
    startMs: 0,
    endMs: 1_000,
  },
  signature,
  comparability: 'eligible',
  observability: 'stable',
  guardrails: [],
}

describe('NullAdapter', () => {
  it('returns no candidates and keeps the manual path explicit', async () => {
    const adapter = new NullAdapter()
    const result = await adapter.propose({ fixtureId: 'fixture', run, zones: [] })
    expect(result).toEqual({
      adapterId: 'null-adapter',
      status: 'disabled',
      proposals: [],
      reason: 'MODEL_DISABLED',
    })
  })
})

describe('LocalMediaSession', () => {
  it('keeps at most one object URL per side and revokes replacements/dispose', () => {
    let sequence = 0
    const create = vi.fn(() => `blob:test-${++sequence}`)
    const revoke = vi.fn()
    const session = new LocalMediaSession(
      { create, revoke },
      (slot, file) => `asset:${slot}:${file.name}`,
    )
    const first = new File(['one'], 'before-a.mp4', { type: 'video/mp4' })
    const replacement = new File(['two'], 'before-b.mp4', { type: 'video/mp4' })
    const after = new File(['three'], 'after.mp4', { type: 'video/mp4' })

    expect(session.set('before', first).ok).toBe(true)
    expect(session.set('before', replacement).ok).toBe(true)
    expect(revoke).toHaveBeenCalledWith('blob:test-1')
    expect(session.set('after', after).ok).toBe(true)
    expect(session.snapshot().before?.displayName).toBe('before-b.mp4')
    expect(session.snapshot().after?.displayName).toBe('after.mp4')

    session.dispose()
    expect(revoke).toHaveBeenCalledWith('blob:test-2')
    expect(revoke).toHaveBeenCalledWith('blob:test-3')
    expect(session.snapshot()).toEqual({})
  })

  it('rejects non-video input without replacing a valid handle', () => {
    const revoke = vi.fn()
    const session = new LocalMediaSession(
      { create: () => 'blob:valid', revoke },
      () => 'asset:valid',
    )
    session.set('before', new File(['x'], 'valid.mp4', { type: 'video/mp4' }))
    const result = session.set(
      'before',
      new File(['text'], 'notes.txt', { type: 'text/plain' }),
    )
    expect(result.ok).toBe(false)
    expect(session.get('before')?.displayName).toBe('valid.mp4')
    expect(revoke).not.toHaveBeenCalled()
  })
})
