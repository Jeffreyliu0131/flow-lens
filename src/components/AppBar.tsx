import { AlertDialog, Button, Select } from '@radix-ui/themes'
import { CaretDown, FrameCorners, SlidersHorizontal, Trash } from '@phosphor-icons/react'
import type { LocalMediaSnapshot, MediaSlot } from '../adapters'
import type { SyntheticScenarioId } from '../fixtures'
import type { WorkspaceView } from '../app/usePrototype'
import { LocalMediaDialog } from './LocalMediaDialog'
import { ScopeStrip } from './ScopeStrip'

const scenarioLabels: Readonly<Record<SyntheticScenarioId, string>> = {
  eligible: '可计算描述性对比',
  'coverage-gap': '覆盖缺口',
  incomparable: '不可比 run',
  'observability-shift': '可见性变化',
  'guardrail-harm': '保护条件恶化',
  'source-mismatch': '原始来源与复核不一致',
}

interface AppBarProps {
  readonly mode: 'synthetic' | 'local'
  readonly view: WorkspaceView
  readonly scenarioId: SyntheticScenarioId
  readonly localMedia: LocalMediaSnapshot
  readonly onView: (view: WorkspaceView) => void
  readonly onScenario: (scenarioId: SyntheticScenarioId) => void
  readonly onLocalFile: (slot: MediaSlot, file: File) => boolean
  readonly onClear: () => void
}

export function AppBar({ mode, view, scenarioId, localMedia, onView, onScenario, onLocalFile, onClear }: AppBarProps) {
  return (
    <header className="app-bar">
      <a className="skip-link" href="#stage-content">跳到当前任务</a>
      <div className="brand-lockup compact">
        <FrameCorners aria-hidden="true" weight="duotone" />
        <span>Flow Lens</span>
      </div>
      <ScopeStrip />
      <div className="stage-tabs view-toggle" role="group" aria-label="工作台视图">
        <button type="button" aria-pressed={view === 'review'} onClick={() => onView('review')}>复核证据</button>
        <button type="button" aria-pressed={view === 'compare'} onClick={() => onView('compare')}>查看对比</button>
        <button type="button" aria-pressed={view === 'provenance'} onClick={() => onView('provenance')}>证据来源</button>
      </div>
      <details className="session-tools">
        <summary><SlidersHorizontal aria-hidden="true" />会话与测试<CaretDown aria-hidden="true" /></summary>
        <div className="appbar-actions">
          {mode === 'synthetic' ? (
            <label className="scenario-field">
              <span>合成测试场景</span>
              <Select.Root value={scenarioId} onValueChange={(value) => onScenario(value as SyntheticScenarioId)}>
                <Select.Trigger aria-label="合成测试场景" className="scenario-trigger" />
                <Select.Content>
                  {(Object.entries(scenarioLabels) as [SyntheticScenarioId, string][]).map(([value, label]) => (
                    <Select.Item key={value} value={value}>{label}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </label>
          ) : null}
          <LocalMediaDialog localMedia={localMedia} onFile={onLocalFile} triggerLabel="本地原始来源" />
          <AlertDialog.Root>
            <AlertDialog.Trigger>
              <Button variant="ghost" color="gray" className="button-quiet">
                <Trash aria-hidden="true" />
                重置会话
              </Button>
            </AlertDialog.Trigger>
            <AlertDialog.Content maxWidth="520px" className="dialog-content">
              <AlertDialog.Title>清除当前应用会话？</AlertDialog.Title>
              <AlertDialog.Description>
                这会清除内存状态并撤销 object URL。它不承诺删除浏览器、操作系统或外部副本。
              </AlertDialog.Description>
              <div className="dialog-actions">
                <AlertDialog.Cancel><Button variant="soft" color="gray">取消</Button></AlertDialog.Cancel>
                <AlertDialog.Action><Button className="button-primary" onClick={onClear}>清除会话</Button></AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </div>
      </details>
    </header>
  )
}
