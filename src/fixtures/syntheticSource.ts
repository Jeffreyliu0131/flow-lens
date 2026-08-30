import type { Phase, ZoneDefinition } from '../domain/schema'

export interface SyntheticKeyframe {
  readonly atMs: number
  readonly x: number
  readonly y: number
  readonly activeZoneId?: string
  readonly parcelProgress: number
}

export interface SyntheticSourceDefinition {
  readonly id: string
  readonly fixtureId: string
  readonly assetId: string
  readonly runId: string
  readonly phase: Phase
  readonly durationMs: number
  readonly width: number
  readonly height: number
  readonly zones: readonly ZoneDefinition[]
  readonly keyframes: readonly SyntheticKeyframe[]
  readonly evidenceIntervals: readonly {
    readonly startMs: number
    readonly endMs: number
    readonly activeZoneId: string
  }[]
}

export interface SyntheticFrame {
  readonly sourceId: string
  readonly runId: string
  readonly phase: Phase
  readonly timeMs: number
  readonly durationMs: number
  readonly hand: { readonly x: number; readonly y: number }
  readonly activeZoneId?: string
  readonly parcelProgress: number
  readonly synthetic: true
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function interpolate(left: number, right: number, progress: number): number {
  return left + (right - left) * progress
}

export function getSyntheticFrame(
  source: SyntheticSourceDefinition,
  requestedTimeMs: number,
): SyntheticFrame {
  const timeMs = clamp(requestedTimeMs, 0, source.durationMs)
  const frames = [...source.keyframes].sort((a, b) => a.atMs - b.atMs)
  const fallback: SyntheticKeyframe = {
    atMs: 0,
    x: source.width / 2,
    y: source.height / 2,
    parcelProgress: 0,
  }
  const first = frames[0] ?? fallback
  const last = frames[frames.length - 1] ?? first

  let previous = first
  let next = last
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]
    if (frame === undefined) continue
    if (frame.atMs <= timeMs) previous = frame
    if (frame.atMs >= timeMs) {
      next = frame
      break
    }
  }

  const span = next.atMs - previous.atMs
  const progress = span <= 0 ? 0 : (timeMs - previous.atMs) / span
  const activeZoneId = source.evidenceIntervals.find(
    (interval) => interval.startMs <= timeMs && timeMs < interval.endMs,
  )?.activeZoneId

  const result: {
    sourceId: string
    runId: string
    phase: Phase
    timeMs: number
    durationMs: number
    hand: { x: number; y: number }
    activeZoneId?: string
    parcelProgress: number
    synthetic: true
  } = {
    sourceId: source.id,
    runId: source.runId,
    phase: source.phase,
    timeMs,
    durationMs: source.durationMs,
    hand: {
      x: interpolate(previous.x, next.x, progress),
      y: interpolate(previous.y, next.y, progress),
    },
    parcelProgress: interpolate(
      previous.parcelProgress,
      next.parcelProgress,
      progress,
    ),
    synthetic: true,
  }
  if (activeZoneId !== undefined) result.activeZoneId = activeZoneId
  return result
}
