import { Button } from '@radix-ui/themes'
import {
  ArrowRight,
  CheckCircle,
  Eye,
  FrameCorners,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react'
import type { LocalMediaSnapshot, MediaSlot } from '../adapters'
import type { SyntheticScenarioId } from '../fixtures'
import { LocalMediaDialog } from './LocalMediaDialog'
import { ScopeStrip } from './ScopeStrip'

interface StartScreenProps {
  readonly localMedia: LocalMediaSnapshot
  readonly onSynthetic: (scenario?: SyntheticScenarioId) => void
  readonly onLocalFile: (slot: MediaSlot, file: File) => boolean
}

export function StartScreen({ localMedia, onSynthetic, onLocalFile }: StartScreenProps) {
  return (
    <div className="start-screen">
      <header className="start-header">
        <a className="brand-lockup" href="#main-start" aria-label="Flow Lens 起始页">
          <FrameCorners aria-hidden="true" weight="duotone" />
          <span>Flow Lens</span>
        </a>
        <ScopeStrip />
      </header>

      <main id="main-start" className="start-main">
        <section className="start-copy" aria-labelledby="start-title">
          <p className="section-kicker">本地合成体验</p>
          <h1 id="start-title" tabIndex={-1}>用 6 次合成复盘，检验一项可逆改动</h1>
          <p>
            查看原始来源、复核低层事件，再比较 3 次基线与 3 次改后。
          </p>
          <div className="synthetic-boundary" role="note">
            <WarningCircle aria-hidden="true" weight="bold" />
            <div>
              <strong>全部数字都是合成示例</strong>
              <span>只能检验界面和证据链，不能证明效率、原因、用户价值或真实视频能力。</span>
            </div>
          </div>
          <div className="start-actions">
            <Button size="3" className="button-primary" onClick={() => onSynthetic('eligible')}>
              开始合成体验
              <ArrowRight aria-hidden="true" />
            </Button>
            <LocalMediaDialog localMedia={localMedia} onFile={onLocalFile} />
          </div>
          <p className="local-mode-limit">
            本地视频每侧只能选 1 个，只适合原始来源（source）复核，不能完成 3+3 对比。
          </p>
          <div className="scope-note">
            <ShieldCheck aria-hidden="true" />
            <span>无账号、无 API key、无上传。不要选择参与者、员工、旁观者、订单或地址等私人素材。</span>
          </div>
        </section>

        <section className="start-journey" aria-labelledby="start-journey-title">
          <div className="start-source-preview" aria-label="程序化合成工位预览">
            <svg viewBox="0 0 720 460" role="img" aria-labelledby="preview-title preview-desc">
              <title id="preview-title">程序化合成工位</title>
              <desc id="preview-desc">一个固定桌面包含物料区、纸箱区、胶带区与标签区。</desc>
              <rect x="18" y="18" width="684" height="424" rx="6" className="preview-table" />
              <rect x="56" y="92" width="156" height="172" rx="6" className="preview-zone" />
              <rect x="280" y="120" width="190" height="230" rx="6" className="preview-zone active" />
              <rect x="520" y="82" width="128" height="118" rx="6" className="preview-zone" />
              <rect x="520" y="264" width="128" height="110" rx="6" className="preview-zone" />
              <rect x="315" y="164" width="120" height="136" rx="4" className="preview-carton" />
              <circle cx="386" cy="235" r="24" className="preview-hand" />
              <path d="M92 336 H626" className="preview-timeline" />
              <path d="M92 336 H418" className="preview-timeline active" />
              <circle cx="418" cy="336" r="8" className="preview-playhead" />
              <text x="56" y="76">物料</text>
              <text x="280" y="104">纸箱</text>
              <text x="520" y="66">胶带</text>
              <text x="520" y="248">标签</text>
            </svg>
            <div className="preview-caption">
              <span>合成原始来源</span>
              <span>时间轴 00:07.420</span>
              <span>观察 E04</span>
            </div>
          </div>

          <div className="start-task-list">
            <div className="start-task-heading">
              <Eye aria-hidden="true" />
              <h2 id="start-journey-title">你会完成 4 件事</h2>
            </div>
            <ol>
              <li><CheckCircle aria-hidden="true" /><span><strong>逐次查看</strong>检查 3 次基线和 3 次改后。</span></li>
              <li><CheckCircle aria-hidden="true" /><span><strong>复核证据</strong>处理候选、修订、撤销与覆盖范围。</span></li>
              <li><CheckCircle aria-hidden="true" /><span><strong>写下改动</strong>只记录一项由你提出的可逆变化。</span></li>
              <li><CheckCircle aria-hidden="true" /><span><strong>自己决定</strong>保留、撤销，或证据不足。</span></li>
            </ol>
          </div>
        </section>
      </main>
    </div>
  )
}
