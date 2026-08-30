import { useMemo, useRef, useState } from 'react'
import { Button } from '@radix-ui/themes'
import { BoundingBox, CursorClick } from '@phosphor-icons/react'
import { listCanonicalObservations, type DomainSession, type RunRecord, type ZoneDefinition } from '../domain'
import { ZoneDialog } from './ZoneDialog'
import { nextUiId } from '../app/idFactory'

interface WorkstationMapProps {
  readonly run: RunRecord
  readonly session: DomainSession
  readonly zones: readonly ZoneDefinition[]
  readonly selectedZoneId?: string | undefined
  readonly onSelectZone: (zoneId: string) => void
  readonly onAddZone: (zone: ZoneDefinition) => void
  readonly onUpdateZone: (zone: ZoneDefinition) => void
}

export function WorkstationMap({ run, session, zones, selectedZoneId, onSelectZone, onAddZone, onUpdateZone }: WorkstationMapProps) {
  const [drawMode, setDrawMode] = useState(false)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const sequence = useMemo(
    () => listCanonicalObservations(session.observations)
      .filter((observation) => observation.payload.source.runId === run.id)
      .sort((left, right) => left.payload.source.startMs - right.payload.source.startMs),
    [run.id, session.observations],
  )
  const position = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect === undefined) return null
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    }
  }

  return (
    <section className="panel map-panel" aria-labelledby="map-title">
      <div className="panel-heading map-heading">
        <div>
          <p className="panel-label">2D 区域</p>
          <h2 id="map-title">工位区域图</h2>
        </div>
        <span>手工示意，不含距离或深度</span>
      </div>
      <details className="map-settings">
        <summary><BoundingBox aria-hidden="true" />区域设置与几何</summary>
        <p>修改区域会使所有复核覆盖范围与对比过期，直到重新复核。</p>
        <div className="map-tools">
          <Button
            variant={drawMode ? 'solid' : 'soft'}
            color={drawMode ? 'orange' : 'gray'}
            aria-pressed={drawMode}
            onClick={() => setDrawMode((value) => !value)}
          >
            <BoundingBox aria-hidden="true" />
            框选区域
          </Button>
          <ZoneDialog onSave={onAddZone} />
        </div>
      </details>
      {drawMode ? (
        <p className="map-instruction" role="status"><CursorClick aria-hidden="true" />在工位图上按下并松开以圈定矩形，也可使用数值圈定。</p>
      ) : null}
      <div className={`workstation-map${drawMode ? ' is-drawing' : ''}`}>
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          role="img"
          aria-labelledby="map-svg-title map-svg-desc"
          onPointerDown={(event) => {
            if (!drawMode) return
            startRef.current = position(event.clientX, event.clientY)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerUp={(event) => {
            if (!drawMode || startRef.current === null) return
            const end = position(event.clientX, event.clientY)
            const start = startRef.current
            startRef.current = null
            if (end === null) return
            const x = Math.min(start.x, end.x)
            const y = Math.min(start.y, end.y)
            const width = Math.abs(end.x - start.x)
            const height = Math.abs(end.y - start.y)
            if (width < 4 || height < 4) return
            onAddZone({
              id: nextUiId('zone-user'),
              roleId: `user-${zones.length + 1}`,
              label: `新区域 ${zones.length + 1}`,
              phaseGeometryVersion: 1,
              x,
              y,
              width,
              height,
            })
            setDrawMode(false)
          }}
        >
          <title id="map-svg-title">手工圈定的固定工位区域</title>
          <desc id="map-svg-desc">区域只表示手工 schematic，不表示深度、距离或连续轨迹。</desc>
          <rect x="1" y="1" width="98" height="98" rx="2" className="map-surface" />
          {zones.map((zone) => (
            <g key={zone.id} className={`map-zone${selectedZoneId === zone.id ? ' is-selected' : ''}`} aria-hidden="true">
              <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="1.2" />
              <text x={zone.x + 2} y={zone.y + 5}>{zone.label}</text>
            </g>
          ))}
          {sequence.map((observation, index) => {
            const zone = zones.find((candidate) => candidate.id === observation.payload.zoneId)
            if (zone === undefined) return null
            return (
              <g key={observation.id} className="sequence-marker" aria-hidden="true">
                <circle cx={zone.x + zone.width / 2} cy={zone.y + zone.height / 2} r="3.5" />
                <text x={zone.x + zone.width / 2} y={zone.y + zone.height / 2 + 1.3}>{index + 1}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <details className="zone-disclosure">
        <summary>查看与编辑 {zones.length} 个区域</summary>
        <div className="zone-list" aria-label="区域文字列表">
          {zones.map((zone) => (
            <div key={zone.id} className={selectedZoneId === zone.id ? 'is-selected' : ''}>
              <button type="button" onClick={() => onSelectZone(zone.id)} aria-current={selectedZoneId === zone.id ? 'true' : undefined}>
                <span>{zone.label}</span>
                <span>{Math.round(zone.width)} × {Math.round(zone.height)}</span>
              </button>
              <ZoneDialog zone={zone} triggerLabel="编辑" onSave={onUpdateZone} />
            </div>
          ))}
        </div>
      </details>
      <p className="panel-footnote">区域为手工 schematic。没有距离、深度、热力图或连续轨迹。</p>
    </section>
  )
}
