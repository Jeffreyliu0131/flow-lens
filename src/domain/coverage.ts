import { err, ok, type DomainResult } from './result'
import type { ReviewCoverage, TimeInterval } from './schema'

export type CoverageBlocker =
  | 'NOT_FINALIZED'
  | 'CANDIDATE_INDEPENDENT_SWEEP_MISSING'
  | 'INVALID_INTERVAL'
  | 'OVERLAPPING_INTERVALS'
  | 'UNKNOWN_INTERVALS_PRESENT'
  | 'UNREVIEWED_INTERVALS_PRESENT'
  | 'REVIEWED_SCOPE_INCOMPLETE'

export interface CoverageEvaluation {
  readonly status: 'full' | 'partial'
  readonly reviewedDurationMs: number
  readonly blockers: readonly CoverageBlocker[]
}

function sorted(intervals: readonly TimeInterval[]): readonly TimeInterval[] {
  return [...intervals].sort(
    (left, right) => left.startMs - right.startMs || left.endMs - right.endMs,
  )
}

function intervalIsValid(interval: TimeInterval, durationMs: number): boolean {
  return (
    Number.isFinite(interval.startMs) &&
    Number.isFinite(interval.endMs) &&
    interval.startMs >= 0 &&
    interval.startMs < interval.endMs &&
    interval.endMs <= durationMs
  )
}

function totalDuration(intervals: readonly TimeInterval[]): number {
  return intervals.reduce(
    (total, interval) => total + interval.endMs - interval.startMs,
    0,
  )
}

function hasOverlap(intervals: readonly TimeInterval[]): boolean {
  const ordered = sorted(intervals)
  return ordered.some((interval, index) => {
    if (index === 0) return false
    const previous = ordered[index - 1]
    return previous !== undefined && interval.startMs < previous.endMs
  })
}

function coversWholeRun(
  intervals: readonly TimeInterval[],
  durationMs: number,
): boolean {
  const ordered = sorted(intervals)
  if (ordered.length === 0 || ordered[0]?.startMs !== 0) return false
  let cursor = 0
  for (const interval of ordered) {
    if (interval.startMs !== cursor) return false
    cursor = interval.endMs
  }
  return cursor === durationMs
}

export function evaluateCoverage(
  coverage: ReviewCoverage,
): DomainResult<CoverageEvaluation> {
  if (!Number.isFinite(coverage.runDurationMs) || coverage.runDurationMs <= 0) {
    return err('INVALID_RUN_DURATION', 'Run duration must be positive')
  }

  const allIntervals = [
    ...coverage.reviewedIntervals,
    ...coverage.unknownIntervals,
    ...coverage.unreviewedIntervals,
  ]
  if (!allIntervals.every((interval) => intervalIsValid(interval, coverage.runDurationMs))) {
    return err('INVALID_COVERAGE_INTERVAL', 'Coverage interval is outside the run')
  }
  if (hasOverlap(allIntervals)) {
    return err('OVERLAPPING_COVERAGE_INTERVALS', 'Coverage partitions overlap')
  }

  const blockers: CoverageBlocker[] = []
  if (!coverage.finalized) blockers.push('NOT_FINALIZED')
  if (!coverage.candidateIndependentSweep) {
    blockers.push('CANDIDATE_INDEPENDENT_SWEEP_MISSING')
  }
  if (coverage.unknownIntervals.length > 0) {
    blockers.push('UNKNOWN_INTERVALS_PRESENT')
  }
  if (coverage.unreviewedIntervals.length > 0) {
    blockers.push('UNREVIEWED_INTERVALS_PRESENT')
  }
  if (!coversWholeRun(coverage.reviewedIntervals, coverage.runDurationMs)) {
    blockers.push('REVIEWED_SCOPE_INCOMPLETE')
  }

  return ok({
    status: blockers.length === 0 ? 'full' : 'partial',
    reviewedDurationMs: totalDuration(coverage.reviewedIntervals),
    blockers,
  })
}

export function isFullCoverage(coverage: ReviewCoverage): boolean {
  const result = evaluateCoverage(coverage)
  return result.ok && result.value.status === 'full'
}
