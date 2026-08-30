import { useEffect, useMemo, useRef } from 'react'
import { IconButton, Tooltip } from '@radix-ui/themes'
import { Pause, Play, SkipBack, SkipForward } from '@phosphor-icons/react'
import type { LocalMediaSnapshot } from '../adapters'
import type { RunRecord, ZoneDefinition } from '../domain'
import { getSyntheticFrame, type SyntheticSourceDefinition } from '../fixtures'
import { formatTime } from '../app/format'

interface SourceViewerProps {
  readonly mode: 'synthetic' | 'local'
  readonly run: RunRecord
  readonly zones: readonly ZoneDefinition[]
  readonly source?: SyntheticSourceDefinition | undefined
  readonly localMedia: LocalMediaSnapshot
  readonly currentTimeMs: number
  readonly isPlaying: boolean
  readonly selectedZoneId?: string | undefined
  readonly onTime: (timeMs: number) => void
  readonly onPlaying: (isPlaying: boolean) => void
  readonly onLocalDuration: (assetId: string, durationMs: number) => void
  readonly onLocalDecodeError: (assetId: string, message: string) => void
  readonly onError: (message: string) => void
  readonly isExperienceReviewed?: boolean | undefined
  readonly onMarkExperienceReviewed?: (() => void) | undefined
}

export function SourceViewer({
  mode,
  run,
  zones,
  source,
  localMedia,
  currentTimeMs,
  isPlaying,
  selectedZoneId,
  onTime,
  onPlaying,
  onLocalDuration,
  onLocalDecodeError,
  onError,
  isExperienceReviewed = false,
  onMarkExperienceReviewed,
}: SourceViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const localHandle = localMedia[run.phase]
  const durationMs = run.durationMs

  useEffect(() => {
    if (mode !== 'synthetic' || !isPlaying) return
    const interval = window.setInterval(() => {
      onTime(Math.min(durationMs, currentTimeMs + 80))
    }, 80)
    return () => window.clearInterval(interval)
  }, [currentTimeMs, durationMs, isPlaying, mode, onTime])

  useEffect(() => {
    if (currentTimeMs >= durationMs && isPlaying) onPlaying(false)
  }, [currentTimeMs, durationMs, isPlaying, onPlaying])

  useEffect(() => {
    const video = videoRef.current
    if (video === null || mode !== 'local') return
    if (Math.abs(video.currentTime * 1_000 - currentTimeMs) > 180) {
      video.currentTime = currentTimeMs / 1_000
    }
  }, [currentTimeMs, mode])

  useEffect(() => {
    const video = videoRef.current
    if (video === null || mode !== 'local') return
    if (isPlaying) {
      void video.play().catch(() => onError('浏览器阻止了本地视频播放。请再次按播放。'))
    } else {
      video.pause()
    }
  }, [isPlaying, mode, onError])

  const step = (deltaMs: number) => onTime(Math.max(0, Math.min(durationMs, currentTimeMs + deltaMs)))

  return (
    <section
      id="workspace-source"
      className="panel source-panel"
      aria-labelledby="source-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest(
            'button, input, select, textarea, summary, [role="button"], [role="slider"], [contenteditable="true"]',
          )
        ) return
        if (event.key === ' ') {
          event.preventDefault()
          onPlaying(!isPlaying)
        }
        if (event.key === 'ArrowLeft') step(event.shiftKey ? -1_000 : -100)
        if (event.key === 'ArrowRight') step(event.shiftKey ? 1_000 : 100)
      }}
    >
      <div className="panel-heading source-heading">
        <div>
          <p className="panel-label">原始来源</p>
          <h2 id="source-title">{run.label.replace('Before', '基线').replace('After', '改后')}</h2>
        </div>
        <span className="source-mode-label">
          {mode === 'synthetic' ? '合成原始来源，不是真实摄像视频' : '会话内本地原始来源，未上传'}
        </span>
      </div>

      <div className="source-frame">
        {mode === 'synthetic' && source !== undefined ? (
          <SyntheticScene
            source={source}
            zones={zones}
            timeMs={currentTimeMs}
            selectedZoneId={selectedZoneId}
          />
        ) : localHandle !== undefined ? (
          <video
            ref={videoRef}
            src={localHandle.objectUrl}
            muted
            playsInline
            preload="metadata"
            aria-label={`${run.phase === 'before' ? '基线' : '改后'}本地视频`}
            onTimeUpdate={(event) => onTime(event.currentTarget.currentTime * 1_000)}
            onLoadedMetadata={(event) => onLocalDuration(localHandle.assetId, event.currentTarget.duration * 1_000)}
            onEnded={() => onPlaying(false)}
            onError={() => onLocalDecodeError(localHandle.assetId, '这个本地视频无法在当前浏览器中解码。失败的会话引用已撤销。')}
          />
        ) : (
          <div className="source-missing" role="status">
            <p>这一侧尚未选择本地视频。</p>
            <span>单次记录复核仍可在已载入的一侧继续，对比保持阻断。</span>
          </div>
        )}
        <span className="timecode-overlay">{formatTime(currentTimeMs)}</span>
      </div>

      <div className="transport" aria-label="原始来源播放控制">
        <Tooltip content="后退 1 秒">
          <IconButton aria-label="后退 1 秒" variant="ghost" color="gray" onClick={() => step(-1_000)}>
            <SkipBack aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Tooltip content={isPlaying ? '暂停' : '播放'}>
          <IconButton
            aria-label={isPlaying ? '暂停' : '播放'}
            className="transport-primary"
            onClick={() => onPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause aria-hidden="true" weight="fill" /> : <Play aria-hidden="true" weight="fill" />}
          </IconButton>
        </Tooltip>
        <Tooltip content="前进 1 秒">
          <IconButton aria-label="前进 1 秒" variant="ghost" color="gray" onClick={() => step(1_000)}>
            <SkipForward aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <input
          type="range"
          className="source-slider"
          value={Math.min(currentTimeMs, durationMs)}
          min={0}
          max={durationMs}
          step={50}
          aria-label="原始来源时间"
          onChange={(event) => onTime(Number(event.currentTarget.value))}
        />
        <span className="transport-duration">{formatTime(durationMs)}</span>
      </div>
      {onMarkExperienceReviewed ? (
        <div className="source-review-action">
          <div>
            <strong>{isExperienceReviewed ? '此记录已完成体验检查' : '看完原始来源与事件后再继续'}</strong>
            <span>这只记录验收进度，不会修改观察、复核覆盖范围或指标。</span>
          </div>
          <button
            type="button"
            className={isExperienceReviewed ? 'is-complete' : ''}
            disabled={isExperienceReviewed}
            onClick={onMarkExperienceReviewed}
          >
            {isExperienceReviewed ? '已查看' : '标记此记录已查看'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function SyntheticScene({ source, zones, timeMs, selectedZoneId }: {
  readonly source: SyntheticSourceDefinition
  readonly zones: readonly ZoneDefinition[]
  readonly timeMs: number
  readonly selectedZoneId?: string | undefined
}) {
  const frame = useMemo(() => getSyntheticFrame(source, timeMs), [source, timeMs])
  const labelOffset = frame.parcelProgress > 0.72 ? 0 : 7
  return (
    <svg viewBox="0 0 100 56.25" role="img" aria-labelledby="synthetic-title synthetic-desc">
      <title id="synthetic-title">随时间变化的程序化合成工位</title>
      <desc id="synthetic-desc">
        纸箱、物料、胶带和标签位于固定桌面，手形标记随 playhead 在区域间移动。
      </desc>
      <rect x="0" y="0" width="100" height="56.25" className="scene-table" />
      <rect x="38" y="13" width="27" height="31" rx="1" className="scene-carton" />
      <path d="M38 13 L44 18 H59 L65 13" className="scene-carton-fold" />
      <rect x="7" y="16" width="15" height="7" rx="1" className="scene-item" />
      <circle cx="82" cy="15" r="5" className="scene-tape" />
      <rect x={76 + labelOffset} y="34" width="14" height="7" rx="0.5" className="scene-label" />
      <rect x="41" y={36 - frame.parcelProgress * 5} width="21" height="4" className="scene-parcel-progress" />
      {zones.map((zone) => (
        <g key={zone.id} className={`source-zone${zone.id === selectedZoneId || zone.id === frame.activeZoneId ? ' is-active' : ''}`}>
          <rect x={zone.x} y={zone.y * 0.5625} width={zone.width} height={zone.height * 0.5625} rx="0.8" />
          <text x={zone.x + 1.2} y={zone.y * 0.5625 + 2.4}>{zone.label}</text>
        </g>
      ))}
      <g className="scene-hand" transform={`translate(${frame.hand.x} ${frame.hand.y * 0.5625})`}>
        <ellipse cx="0" cy="0" rx="3.3" ry="2.2" />
        <path d="M-2.8 0 C-5.5 1.2 -6.4 3.8 -3.1 5.8" />
      </g>
    </svg>
  )
}
