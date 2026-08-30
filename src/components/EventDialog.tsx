import { useRef, useState } from 'react'
import { Button, Dialog, Select, TextField } from '@radix-ui/themes'
import { Plus } from '@phosphor-icons/react'
import type { EventKind, ZoneDefinition } from '../domain'
import { eventKindLabel, formatTime } from '../app/format'

interface EventDialogProps {
  readonly currentTimeMs: number
  readonly durationMs: number
  readonly zones: readonly ZoneDefinition[]
  readonly onCreate: (input: { zoneId: string; startMs: number; endMs: number; eventKind: EventKind }) => string | null
}

export function EventDialog({ currentTimeMs, durationMs, zones, onCreate }: EventDialogProps) {
  const [open, setOpen] = useState(false)
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? '')
  const [eventKind, setEventKind] = useState<EventKind>('zone-entry')
  const [startSeconds, setStartSeconds] = useState((currentTimeMs / 1_000).toFixed(2))
  const [endSeconds, setEndSeconds] = useState((Math.min(durationMs, currentTimeMs + 500) / 1_000).toFixed(2))
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLDivElement>(null)
  const showError = (message: string) => {
    setError(message)
    window.setTimeout(() => errorRef.current?.focus(), 0)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setStartSeconds((currentTimeMs / 1_000).toFixed(2))
      setEndSeconds((Math.min(durationMs, currentTimeMs + 500) / 1_000).toFixed(2))
      setZoneId((prior) => prior || zones[0]?.id || '')
      setError('')
    }
    setOpen(nextOpen)
  }

  const submit = () => {
    const startMs = Number(startSeconds) * 1_000
    const endMs = Number(endSeconds) * 1_000
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || startMs >= endMs || endMs > durationMs) {
      showError(`时间必须位于 0 到 ${formatTime(durationMs)}，且结束晚于开始。`)
      return
    }
    if (!zoneId) {
      showError('请选择一个工位区域。')
      return
    }
    const observationId = onCreate({ zoneId, startMs, endMs, eventKind })
    if (observationId === null) return
    setOpen(false)
    window.setTimeout(() => {
      const row = [...document.querySelectorAll<HTMLButtonElement>('.evidence-list button[data-observation-id]')]
        .find((element) => element.dataset.observationId === observationId)
      row?.focus()
    }, 0)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>
        <Button className="button-primary" size="2">
          <Plus aria-hidden="true" />
          新建观察
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="520px" className="dialog-content">
        <Dialog.Title>在 playhead 创建观察</Dialog.Title>
        <Dialog.Description>观察先进入待复核状态，不会直接计入指标。</Dialog.Description>
        {error ? <div ref={errorRef} className="inline-error" role="alert" tabIndex={-1}>{error}</div> : null}
        <div className="form-grid">
          <label>
            <span>低层事件</span>
            <Select.Root value={eventKind} onValueChange={(value) => setEventKind(value as EventKind)}>
              <Select.Trigger aria-label="低层事件类型" />
              <Select.Content>
                {(Object.entries(eventKindLabel) as [EventKind, string][]).map(([value, label]) => (
                  <Select.Item key={value} value={value}>{label}</Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <label>
            <span>区域</span>
            <Select.Root value={zoneId} onValueChange={setZoneId}>
              <Select.Trigger aria-label="工位区域" />
              <Select.Content>
                {zones.map((zone) => <Select.Item key={zone.id} value={zone.id}>{zone.label}</Select.Item>)}
              </Select.Content>
            </Select.Root>
          </label>
          <label>
            <span>开始秒数</span>
            <TextField.Root type="number" value={startSeconds} onChange={(event) => setStartSeconds(event.currentTarget.value)} step="0.05" min="0" />
          </label>
          <label>
            <span>结束秒数</span>
            <TextField.Root type="number" value={endSeconds} onChange={(event) => setEndSeconds(event.currentTarget.value)} step="0.05" min="0" />
          </label>
        </div>
        <div className="dialog-actions">
          <Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close>
          <Button className="button-primary" onClick={submit}>保存为待复核</Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
