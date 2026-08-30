import { useRef, useState } from 'react'
import { Button, Dialog, Select, TextField } from '@radix-ui/themes'
import { PencilSimple } from '@phosphor-icons/react'
import {
  getActiveRevision,
  type EventKind,
  type ObservationPayload,
  type ObservationRecord,
  type ZoneDefinition,
} from '../domain'
import { eventKindLabel } from '../app/format'

interface EditObservationDialogProps {
  readonly record: ObservationRecord
  readonly zones: readonly ZoneDefinition[]
  readonly onSave: (payload: ObservationPayload) => boolean
}

export function EditObservationDialog({ record, zones, onSave }: EditObservationDialogProps) {
  const active = getActiveRevision(record)
  const base = active?.payload
  const [open, setOpen] = useState(false)
  const [zoneId, setZoneId] = useState(base?.zoneId ?? record.candidate.payload.zoneId)
  const [eventKind, setEventKind] = useState<EventKind>(base?.eventKind ?? record.candidate.payload.eventKind)
  const [start, setStart] = useState(String((base?.source.startMs ?? record.candidate.payload.source.startMs) / 1_000))
  const [end, setEnd] = useState(String((base?.source.endMs ?? record.candidate.payload.source.endMs) / 1_000))
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLDivElement>(null)
  const showError = (message: string) => {
    setError(message)
    window.setTimeout(() => errorRef.current?.focus(), 0)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const current = getActiveRevision(record)?.payload ?? record.candidate.payload
      setZoneId(current.zoneId)
      setEventKind(current.eventKind)
      setStart(String(current.source.startMs / 1_000))
      setEnd(String(current.source.endMs / 1_000))
      setError('')
    }
    setOpen(nextOpen)
  }

  if (base === undefined) return null

  const save = () => {
    const startMs = Number(start) * 1_000
    const endMs = Number(end) * 1_000
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || startMs >= endMs) {
      showError('结束时间必须晚于开始时间。')
      return
    }
    const payload: ObservationPayload = {
      ...base,
      zoneId,
      eventKind,
      source: { ...base.source, startMs, endMs },
    }
    if (onSave(payload)) setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>
        <Button variant="soft" color="gray"><PencilSimple aria-hidden="true" />修订</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="520px" className="dialog-content">
        <Dialog.Title>建立新的最终修订</Dialog.Title>
        <Dialog.Description>旧版本保留。保存后会使依赖指标过期并重新计算。</Dialog.Description>
        {error ? <div ref={errorRef} className="inline-error" role="alert" tabIndex={-1}>{error}</div> : null}
        <div className="form-grid">
          <label>
            <span>低层事件</span>
            <Select.Root value={eventKind} onValueChange={(value) => setEventKind(value as EventKind)}>
              <Select.Trigger aria-label="低层事件类型" />
              <Select.Content>
                {(Object.entries(eventKindLabel) as [EventKind, string][]).map(([value, label]) => <Select.Item key={value} value={value}>{label}</Select.Item>)}
              </Select.Content>
            </Select.Root>
          </label>
          <label>
            <span>区域</span>
            <Select.Root value={zoneId} onValueChange={setZoneId}>
              <Select.Trigger aria-label="工位区域" />
              <Select.Content>{zones.map((zone) => <Select.Item key={zone.id} value={zone.id}>{zone.label}</Select.Item>)}</Select.Content>
            </Select.Root>
          </label>
          <label><span>开始秒数</span><TextField.Root type="number" step="0.05" value={start} onChange={(event) => setStart(event.currentTarget.value)} /></label>
          <label><span>结束秒数</span><TextField.Root type="number" step="0.05" value={end} onChange={(event) => setEnd(event.currentTarget.value)} /></label>
        </div>
        <div className="dialog-actions">
          <Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close>
          <Button className="button-primary" onClick={save}>最终确认修订</Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
