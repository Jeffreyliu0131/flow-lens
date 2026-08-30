import { useRef, useState } from 'react'
import { Button, Dialog, TextField } from '@radix-ui/themes'
import { Plus, SlidersHorizontal } from '@phosphor-icons/react'
import type { ZoneDefinition } from '../domain'
import { nextUiId } from '../app/idFactory'

interface ZoneDialogProps {
  readonly zone?: ZoneDefinition | undefined
  readonly triggerLabel?: string | undefined
  readonly onSave: (zone: ZoneDefinition) => void
}

export function ZoneDialog({ zone, triggerLabel = '数值圈定', onSave }: ZoneDialogProps) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState(zone?.label ?? '')
  const [x, setX] = useState(String(zone?.x ?? 12))
  const [y, setY] = useState(String(zone?.y ?? 12))
  const [width, setWidth] = useState(String(zone?.width ?? 22))
  const [height, setHeight] = useState(String(zone?.height ?? 22))
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLDivElement>(null)
  const showError = (message: string) => {
    setError(message)
    window.setTimeout(() => errorRef.current?.focus(), 0)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLabel(zone?.label ?? '')
      setX(String(zone?.x ?? 12))
      setY(String(zone?.y ?? 12))
      setWidth(String(zone?.width ?? 22))
      setHeight(String(zone?.height ?? 22))
      setError('')
    }
    setOpen(nextOpen)
  }

  const save = () => {
    const numbers = [Number(x), Number(y), Number(width), Number(height)]
    if (!label.trim()) {
      showError('请输入区域名称。')
      return
    }
    if (numbers.some((value) => !Number.isFinite(value)) || numbers[0]! < 0 || numbers[1]! < 0 || numbers[2]! <= 0 || numbers[3]! <= 0 || numbers[0]! + numbers[2]! > 100 || numbers[1]! + numbers[3]! > 100) {
      showError('坐标与尺寸使用 0 到 100 的百分比，区域必须位于工位内。')
      return
    }
    const id = zone?.id ?? nextUiId('zone-user')
    onSave({
      id,
      roleId: zone?.roleId ?? `user-${id}`,
      label: label.trim(),
      phaseGeometryVersion: (zone?.phaseGeometryVersion ?? 0) + 1,
      x: numbers[0]!,
      y: numbers[1]!,
      width: numbers[2]!,
      height: numbers[3]!,
    })
    setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>
        <Button variant="soft" color="gray">
          {zone ? <SlidersHorizontal aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {triggerLabel}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="520px" className="dialog-content">
        <Dialog.Title>{zone ? '编辑工位区域' : '数值圈定工位区域'}</Dialog.Title>
        <Dialog.Description>这是 pointer 框选的键盘等价路径。坐标以工位宽高百分比表示。</Dialog.Description>
        {error ? <div ref={errorRef} className="inline-error" role="alert" tabIndex={-1}>{error}</div> : null}
        <div className="form-grid zone-form-grid">
          <label className="span-two"><span>区域名称</span><TextField.Root value={label} onChange={(event) => setLabel(event.currentTarget.value)} /></label>
          <label><span>X</span><TextField.Root type="number" value={x} onChange={(event) => setX(event.currentTarget.value)} min="0" max="100" /></label>
          <label><span>Y</span><TextField.Root type="number" value={y} onChange={(event) => setY(event.currentTarget.value)} min="0" max="100" /></label>
          <label><span>宽度</span><TextField.Root type="number" value={width} onChange={(event) => setWidth(event.currentTarget.value)} min="1" max="100" /></label>
          <label><span>高度</span><TextField.Root type="number" value={height} onChange={(event) => setHeight(event.currentTarget.value)} min="1" max="100" /></label>
        </div>
        <div className="dialog-actions">
          <Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close>
          <Button className="button-primary" onClick={save}>保存区域</Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
