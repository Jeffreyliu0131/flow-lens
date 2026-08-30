import { useMemo, useState } from 'react'
import { IconButton, Tooltip } from '@radix-ui/themes'
import { MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react'
import {
  type EventKind,
  getObservationState,
  type DomainSession,
  type ReviewCoverage,
  type RunRecord,
  type ZoneDefinition,
} from '../domain'
import { displayObservationId, eventKindLabel, formatTime } from '../app/format'
import { EventDialog } from './EventDialog'
import { effectivePayload } from '../app/observationSelectors'

interface TimelineProps {
  readonly run: RunRecord
  readonly session: DomainSession
  readonly coverage?: ReviewCoverage | undefined
  readonly zones: readonly ZoneDefinition[]
  readonly currentTimeMs: number
  readonly selectedObservationId: string | null
  readonly onTime: (timeMs: number) => void
  readonly onSelectObservation: (observationId: string) => void
  readonly onCreate: (input: { zoneId: string; startMs: number; endMs: number; eventKind: EventKind }) => string | null
}

export function Timeline({ run, session, coverage, zones, currentTimeMs, selectedObservationId, onSelectObservation, onCreate }: TimelineProps) {
  const [zoom, setZoom] = useState(1)
  const observations = useMemo(
    () => Object.values(session.observations)
      .filter((record) => record.candidate.payload.source.runId === run.id)
      .sort((left, right) => effectivePayload(left).source.startMs - effectivePayload(right).source.startMs),
    [run.id, session.observations],
  )
  const width = `${Math.max(100, zoom * 100)}%`

  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-title">
      <div className="panel-heading timeline-heading">
        <div>
          <p className="panel-label">时间证据</p>
          <h2 id="timeline-title">事件与复核覆盖范围</h2>
        </div>
        <div className="timeline-tools">
          <Tooltip content="缩小时间轴">
            <IconButton aria-label="缩小时间轴" variant="ghost" color="gray" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>
              <MagnifyingGlassMinus aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip content="放大时间轴">
            <IconButton aria-label="放大时间轴" variant="ghost" color="gray" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
              <MagnifyingGlassPlus aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <EventDialog currentTimeMs={currentTimeMs} durationMs={run.durationMs} zones={zones} onCreate={onCreate} />
        </div>
      </div>

      <div className="timeline-scroll" tabIndex={0} aria-label="可横向滚动的时间轴">
        <div className="timeline-canvas" style={{ width }}>
          <div className="timeline-ruler" aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <span key={ratio} style={{ left: `${ratio * 100}%` }}>{formatTime(run.durationMs * ratio)}</span>
            ))}
          </div>
          <div className="timeline-track event-track" aria-label="观察事件">
            {observations.length === 0 ? <span className="timeline-empty">尚未标注，不等于零事件</span> : null}
            {observations.map((record) => {
              const payload = effectivePayload(record)
              const source = payload.source
              const left = (source.startMs / run.durationMs) * 100
              const eventWidth = Math.max(1.3, ((source.endMs - source.startMs) / run.durationMs) * 100)
              const state = getObservationState(record)
              const lowConfidence = record.candidate.confidence !== undefined && record.candidate.confidence < 0.5
              return (
                <button
                  key={record.candidate.id}
                  type="button"
                  className={`timeline-event status-${state}${selectedObservationId === record.candidate.id ? ' is-selected' : ''}${lowConfidence ? ' is-low-confidence' : ''}`}
                  data-observation-id={record.candidate.id}
                  style={{ left: `${left}%`, width: `${eventWidth}%` }}
                  aria-pressed={selectedObservationId === record.candidate.id}
                  aria-label={`${eventKindLabel[payload.eventKind]}，${formatTime(source.startMs)} 到 ${formatTime(source.endMs)}`}
                  onClick={() => onSelectObservation(record.candidate.id)}
                >
                  <span>{displayObservationId(record.candidate.id)}</span>
                </button>
              )
            })}
            <span
              className="timeline-playhead"
              style={{ left: `${(currentTimeMs / run.durationMs) * 100}%` }}
              aria-hidden="true"
            />
          </div>
          <CoverageTrack run={run} coverage={coverage} />
        </div>
      </div>

      <p className="timeline-footnote">完整观察列表和状态在“人工复核”步骤中。未知或未复核区间不会补成零。</p>
    </section>
  )
}

function CoverageTrack({ run, coverage }: { readonly run: RunRecord; readonly coverage?: ReviewCoverage | undefined }) {
  return (
    <div className="timeline-track coverage-track" aria-label="复核覆盖范围">
      {coverage?.reviewedIntervals.map((interval, index) => (
        <span
          key={`reviewed-${index}`}
          className="coverage-segment is-reviewed"
          style={{ left: `${(interval.startMs / run.durationMs) * 100}%`, width: `${((interval.endMs - interval.startMs) / run.durationMs) * 100}%` }}
        >已复核</span>
      ))}
      {coverage?.unknownIntervals.map((interval, index) => (
        <span
          key={`unknown-${index}`}
          className="coverage-segment is-unknown"
          style={{ left: `${(interval.startMs / run.durationMs) * 100}%`, width: `${((interval.endMs - interval.startMs) / run.durationMs) * 100}%` }}
        >未知</span>
      ))}
      {coverage?.unreviewedIntervals.map((interval, index) => (
        <span
          key={`unreviewed-${index}`}
          className="coverage-segment is-unreviewed"
          style={{ left: `${(interval.startMs / run.durationMs) * 100}%`, width: `${((interval.endMs - interval.startMs) / run.durationMs) * 100}%` }}
        >未复核</span>
      ))}
    </div>
  )
}
