import { useId, useState } from 'react'
import { Button, Checkbox, Dialog } from '@radix-ui/themes'
import { FilmStrip, LockKeyOpen, UploadSimple } from '@phosphor-icons/react'
import type { LocalMediaSnapshot, MediaSlot } from '../adapters'

interface LocalMediaDialogProps {
  readonly localMedia: LocalMediaSnapshot
  readonly onFile: (slot: MediaSlot, file: File) => boolean
  readonly triggerLabel?: string
}

export function LocalMediaDialog({ localMedia, onFile, triggerLabel = '查看本地原始来源限制' }: LocalMediaDialogProps) {
  const acknowledgmentId = useId()
  const [acknowledged, setAcknowledged] = useState(false)
  const [open, setOpen] = useState(false)

  const handleFile = (slot: MediaSlot, file: File | undefined) => {
    if (!acknowledged || file === undefined) return
    if (onFile(slot, file)) setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button variant="soft" color="gray" className="button-secondary">
          <UploadSimple aria-hidden="true" />
          {triggerLabel}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="620px" className="dialog-content">
        <Dialog.Title>选择会话内本地原始来源（source）</Dialog.Title>
        <Dialog.Description>
          每侧最多 1 个视频，只能做单次原始来源复核，不能形成有效 3+3 对比。没有自动视觉分析。
        </Dialog.Description>

        <div className="privacy-boundary" role="note">
          <LockKeyOpen aria-hidden="true" />
          <p>
            文件不会上传或持久保存。浏览器内 object URL 不等于加密、安全删除或私人数据处理获批；重置只清除应用会话引用。
          </p>
        </div>

        <label className="acknowledgment" htmlFor={acknowledgmentId}>
          <Checkbox
            id={acknowledgmentId}
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
          />
          <span>我确认素材不包含参与者、员工、旁观者或其他私人数据，并且来源允许本地复盘。</span>
        </label>

        <div className="file-slot-grid">
          <FileSlot
            slot="before"
            label="基线视频"
            currentName={localMedia.before?.displayName}
            disabled={!acknowledged}
            onFile={handleFile}
          />
          <FileSlot
            slot="after"
            label="改后视频"
            currentName={localMedia.after?.displayName}
            disabled={!acknowledged}
            onFile={handleFile}
          />
        </div>

        <p className="form-hint">支持范围由当前浏览器决定。原型接受 video/*，解码失败时不会调用云端转码。这个入口不参与合成 3+3 体验的完成状态。</p>
        <div className="dialog-actions">
          <Dialog.Close>
            <Button variant="soft" color="gray">关闭</Button>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function FileSlot({
  slot,
  label,
  currentName,
  disabled,
  onFile,
}: {
  readonly slot: MediaSlot
  readonly label: string
  readonly currentName?: string | undefined
  readonly disabled: boolean
  readonly onFile: (slot: MediaSlot, file: File | undefined) => void
}) {
  const inputId = useId()
  return (
    <div className="file-slot">
      <FilmStrip aria-hidden="true" />
      <div>
        <label htmlFor={inputId}>{label}</label>
        <span>{currentName ?? '尚未选择'}</span>
      </div>
      <input
        id={inputId}
        type="file"
        accept="video/*"
        disabled={disabled}
        onChange={(event) => onFile(slot, event.currentTarget.files?.[0])}
      />
    </div>
  )
}
