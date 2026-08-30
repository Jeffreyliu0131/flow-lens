import { describe, expect, it } from 'vitest'
import { evaluateCoverage } from './coverage'
import type { ReviewCoverage } from './schema'

function coverage(overrides: Partial<ReviewCoverage> = {}): ReviewCoverage {
  return {
    id: 'coverage-1',
    runId: 'run-1',
    version: 1,
    runDurationMs: 1_000,
    reviewedIntervals: [{ startMs: 0, endMs: 1_000 }],
    unknownIntervals: [],
    unreviewedIntervals: [],
    candidateIndependentSweep: true,
    finalized: true,
    zoneGeometryFingerprint: 'zones-v1',
    ...overrides,
  }
}

describe('coverage', () => {
  it('accepts contiguous full-run review', () => {
    const result = evaluateCoverage(
      coverage({
        reviewedIntervals: [
          { startMs: 0, endMs: 400 },
          { startMs: 400, endMs: 1_000 },
        ],
      }),
    )
    expect(result).toEqual({
      ok: true,
      value: { status: 'full', reviewedDurationMs: 1_000, blockers: [] },
    })
  })

  it('keeps a gap partial and rejects overlapping partitions', () => {
    const partial = evaluateCoverage(
      coverage({
        reviewedIntervals: [{ startMs: 0, endMs: 500 }],
        unknownIntervals: [{ startMs: 500, endMs: 650 }],
        unreviewedIntervals: [{ startMs: 650, endMs: 1_000 }],
      }),
    )
    expect(partial.ok && partial.value.status).toBe('partial')
    expect(partial.ok && partial.value.blockers).toContain(
      'UNKNOWN_INTERVALS_PRESENT',
    )

    const overlap = evaluateCoverage(
      coverage({
        reviewedIntervals: [{ startMs: 0, endMs: 700 }],
        unknownIntervals: [{ startMs: 600, endMs: 800 }],
      }),
    )
    expect(overlap.ok).toBe(false)
  })
})
