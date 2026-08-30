import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@radix-ui/themes'
import {
  ArrowLeft,
  ArrowRight,
  Info,
  Keyboard,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  WarningCircle,
} from '@phosphor-icons/react'
import { deriveEvidence } from './derive'
import {
  deriveExperienceFlow,
  EXPERIENCE_LOCAL_LIMIT_BLOCKER,
  type ExperienceFlow,
  type ExperienceStage,
} from './experienceFlow'
import { usePrototype } from './usePrototype'
import { evaluateCoverage, getObservationState } from '../domain'
import { effectivePayload } from './observationSelectors'
import { labelBlocker } from './format'
import { AppBar } from '../components/AppBar'
import { ComparePanel } from '../components/ComparePanel'
import { EvidenceInspector } from '../components/EvidenceInspector'
import {
  ExperienceGuide,
  type ExperienceGuideStep,
} from '../components/ExperienceGuide'
import { LoadingWorkspace } from '../components/LoadingWorkspace'
import { ProvenancePanel } from '../components/ProvenancePanel'
import { RunRail } from '../components/RunRail'
import { SourceViewer } from '../components/SourceViewer'
import { StartScreen } from '../components/StartScreen'
import { Timeline } from '../components/Timeline'
import { WorkstationMap } from '../components/WorkbenchMap'
import { LocalMediaDialog } from '../components/LocalMediaDialog'

type MobileSurface = 'source' | 'timeline' | 'map' | 'evidence'

const mobileSurfaceOrder: readonly MobileSurface[] = [
  'source',
  'timeline',
  'map',
  'evidence',
]

const mobileSurfaceLabel: Readonly<Record<MobileSurface, string>> = {
  source: '来源',
  timeline: '时间轴',
  map: '区域',
  evidence: '观察',
}

function stageIsCurrent(flow: ExperienceFlow, stage: ExperienceStage): boolean {
  return flow.stage === stage
}

function makeGuideSteps(
  flow: ExperienceFlow,
  mode: 'synthetic' | 'local',
): readonly ExperienceGuideStep[] {
  const state = (
    done: boolean,
    stage: ExperienceStage,
    blocked = false,
  ): ExperienceGuideStep['state'] => {
    if (done) return 'complete'
    if (blocked) return 'blocked'
    return stageIsCurrent(flow, stage) ? 'current' : 'pending'
  }
  return [
    {
      id: 'scope',
      label: mode === 'synthetic' ? '理解合成范围' : '理解本地范围',
      state: state(flow.progress.scopeComplete, 'scope'),
    },
    {
      id: 'review',
      label: `逐次检查 ${flow.progress.reviewedRuns} / 6`,
      state: state(
        flow.reviewComplete,
        'review',
        flow.localThreePlusThreeUnavailable,
      ),
    },
    {
      id: 'change',
      label: '写下一项改动',
      state: state(flow.progress.changeComplete, 'change'),
    },
    {
      id: 'decision',
      label: '自己作出决定',
      state: state(flow.progress.decisionComplete, 'decision'),
    },
  ]
}

function guideCopy(
  flow: ExperienceFlow,
  mode: 'synthetic' | 'local',
): { readonly title: string; readonly detail: string } {
  if (flow.stage === 'scope') {
    if (mode === 'local') {
      return {
        title: '先确认本地来源与 1+1 限制',
        detail: '来源和许可只由用户声明，未经验证；每侧一个视频不能完成 3+3，也没有自动视觉分析。',
      }
    }
    return {
      title: '先确认这是一段合成体验',
      detail: '所有原始来源（source）、事件和差值都是程序化示例，只用于检查体验与证据链。',
    }
  }
  if (flow.stage === 'review') {
    const nextRun = flow.runs.find((run) => run.runId === flow.nextAction.runId)
    return {
      title: nextRun ? `检查 ${nextRun.label}` : '完成 3 次基线和 3 次改后检查',
      detail: '先看原始来源，再处理待复核事件；体验标记不会修改规范证据。',
    }
  }
  if (flow.stage === 'change') {
    return {
      title: '写下一项你能撤销的改动',
      detail: '系统不会推荐答案。只记录一项由你提出、可保留或撤销的变化。',
    }
  }
  if (flow.stage === 'decision') {
    return {
      title: flow.comparisonReady ? '查看描述性差值，再自己决定' : '先解除对比阻断',
      detail: flow.comparisonReady
        ? '差值不等于改善。读完替代解释后选择保留、撤销或证据不足。'
        : '任一复核覆盖范围、可比性、可见性、保护条件或原始来源失败都会停止对比。',
    }
  }
  return {
    title: '合成体验流程已完成',
    detail: '这只表示本地体验路径完成，不能得出需求、真实能力或改善结论。',
  }
}

function experienceBlockerText(flow: ExperienceFlow): string | undefined {
  const blocker = flow.nextAction.blockers[0]
  if (blocker === undefined) return undefined
  if (blocker === EXPERIENCE_LOCAL_LIMIT_BLOCKER) {
    return '本地模式每侧只有 1 个 source，不能完成 3+3。请切换到合成体验。'
  }
  if (blocker === 'EVENT_REVIEW_PENDING') {
    return '当前记录还有待复核或编辑草稿观察。它们不会进入指标。'
  }
  if (blocker === 'CLAIM_PACKAGE_UNAVAILABLE') {
    return '对比缺少完整主张包（ClaimPackage），决定保持阻断。'
  }
  if (blocker === 'DERIVATION_ERROR') {
    return '证据派生失败，旧结果不会作为当前输出。'
  }
  if (blocker === 'EXPERIENCE_RUN_COUNT_MISMATCH') {
    return '合成体验必须恰好包含 3 次基线和 3 次改后记录。'
  }
  return labelBlocker(blocker)
}

export function App() {
  const controller = usePrototype()
  const [mobileSurface, setMobileSurface] = useState<MobileSurface>('source')
  const priorViewRef = useRef(controller.view)
  const priorPhaseRef = useRef<typeof controller.phase | null>(null)
  const priorErrorRef = useRef<string | null>(null)
  const fixture = controller.fixture
  const session = controller.session
  const derived = useMemo(() => {
    if (!fixture || !session) return null
    return deriveEvidence(
      fixture,
      session,
      controller.mode === 'synthetic'
        ? {
            expectedProvenance: 'synthetic',
            syntheticSources:
              controller.workbench.scenarios[controller.scenarioId].sources,
          }
        : { expectedProvenance: 'user-asserted-unverified' },
    )
  }, [
    controller.mode,
    controller.scenarioId,
    controller.workbench.scenarios,
    fixture,
    session,
  ])
  const experienceFlow = useMemo(
    () => deriveExperienceFlow({
      phase: controller.phase,
      mode: controller.mode,
      fixture,
      session,
      derived,
      interaction: controller.experienceInteraction,
    }),
    [
      controller.experienceInteraction,
      controller.mode,
      controller.phase,
      derived,
      fixture,
      session,
    ],
  )

  useEffect(() => {
    const phaseChanged = priorPhaseRef.current !== controller.phase
    const newError = controller.error !== null && priorErrorRef.current !== controller.error
    priorPhaseRef.current = controller.phase
    priorErrorRef.current = controller.error
    if (!phaseChanged && !newError) return
    const timer = window.setTimeout(() => {
      const targetId = controller.error && fixture !== null
        ? 'global-error'
        : controller.phase === 'ready'
          ? 'experience-guide-title'
          : controller.phase === 'empty'
            ? 'start-title'
            : controller.phase === 'error'
              ? 'fatal-title'
              : null
      if (targetId) document.getElementById(targetId)?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [controller.error, controller.phase, fixture])

  useEffect(() => {
    if (controller.phase !== 'ready') return
    if (priorViewRef.current === controller.view) return
    priorViewRef.current = controller.view
    const timer = window.setTimeout(() => {
      const target = document.getElementById('stage-content')
      target?.focus()
      target?.scrollIntoView({ block: 'start' })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [controller.phase, controller.view])

  if (controller.phase === 'loading') return <LoadingWorkspace />
  if (controller.phase === 'empty') {
    return (
      <StartScreen
        localMedia={controller.localMedia}
        onSynthetic={controller.loadSynthetic}
        onLocalFile={controller.setLocalFile}
      />
    )
  }
  if ((fixture === null || session === null) && controller.phase === 'error') {
    return (
      <main className="fatal-state">
        <WarningCircle aria-hidden="true" />
        <h1 id="fatal-title" tabIndex={-1}>无法打开这个素材</h1>
        <p>{controller.error}</p>
        <div className="fatal-actions">
          <LocalMediaDialog
            localMedia={controller.localMedia}
            onFile={controller.setLocalFile}
            triggerLabel="选择替代来源"
          />
          <Button className="button-primary" onClick={() => controller.loadSynthetic('eligible')}>改用合成体验</Button>
        </div>
      </main>
    )
  }
  if (fixture === null || session === null || derived === null) return null

  const selectedRun = fixture.runs.find((run) => run.id === controller.selectedRunId) ?? fixture.runs[0]
  if (selectedRun === undefined) {
    return (
      <main className="fatal-state">
        <WarningCircle aria-hidden="true" />
        <h1 id="fatal-title" tabIndex={-1}>会话中没有可复核的记录</h1>
        <p>请载入合成体验，或为基线与改后至少选择一份本地 source。</p>
        <Button className="button-primary" onClick={() => controller.loadSynthetic('eligible')}>载入合成体验</Button>
      </main>
    )
  }

  const selectedRecord = controller.selectedObservationId
    ? session.observations[controller.selectedObservationId]
    : undefined
  const selectedPayload = selectedRecord ? effectivePayload(selectedRecord) : undefined
  const selectedZoneId = selectedPayload?.zoneId
  const selectedCoverage = fixture.coverages[selectedRun.id]
  const coverageEvaluation = selectedCoverage ? evaluateCoverage(selectedCoverage) : null
  const canFinalizeCoverage = !(
    coverageEvaluation?.ok === true &&
    coverageEvaluation.value.status === 'full' &&
    selectedCoverage?.zoneGeometryFingerprint === session.zoneRegistry.geometryFingerprint
  )
  const runFlow = experienceFlow.runs.find((run) => run.runId === selectedRun.id)
  const guide = guideCopy(experienceFlow, controller.mode)

  const switchMobileSurface = (surface: MobileSurface) => {
    setMobileSurface(surface)
    window.setTimeout(() => {
      const target = document.getElementById(`mobile-panel-${surface}`)
      target?.focus()
      target?.scrollIntoView({ block: 'start' })
    }, 0)
  }

  const selectRun = (runId: string) => {
    controller.selectRun(runId)
    switchMobileSurface('source')
  }

  const performNextAction = () => {
    const next = experienceFlow.nextAction
    if (next.kind === 'load-synthetic' || next.kind === 'switch-to-synthetic') {
      controller.loadSynthetic('eligible')
      return
    }
    if (next.kind === 'acknowledge-scope') {
      controller.acknowledgeExperienceScope()
      controller.setView('review')
      return
    }
    if (next.kind === 'review-run') {
      controller.setView('review')
      if (next.runId) selectRun(next.runId)
      return
    }
    if (next.kind === 'resolve-run-blockers') {
      controller.setView('review')
      if (next.runId) controller.selectRun(next.runId)
      switchMobileSurface('evidence')
      return
    }
    if (
      next.kind === 'write-change' ||
      next.kind === 'resolve-comparison-blockers' ||
      next.kind === 'record-decision' ||
      next.kind === 'complete'
    ) {
      controller.setView('compare')
    }
  }

  const activeMobileIndex = mobileSurfaceOrder.indexOf(mobileSurface)
  const priorSurface = mobileSurfaceOrder[activeMobileIndex - 1]
  const nextSurface = mobileSurfaceOrder[activeMobileIndex + 1]

  return (
    <div className="app-shell">
      <AppBar
        mode={controller.mode}
        view={controller.view}
        scenarioId={controller.scenarioId}
        localMedia={controller.localMedia}
        onView={controller.setView}
        onScenario={controller.setScenario}
        onLocalFile={controller.setLocalFile}
        onClear={controller.clearSession}
      />

      {controller.error ? (
        <div id="global-error" className="global-error" role="alert" tabIndex={-1}>
          <WarningCircle aria-hidden="true" />
          <div><strong>当前 source 不可用</strong><span>{controller.error}</span></div>
          <LocalMediaDialog localMedia={controller.localMedia} onFile={controller.setLocalFile} triggerLabel="选择替代来源" />
          <Button variant="soft" color="gray" onClick={() => controller.loadSynthetic('eligible')}>改用合成体验</Button>
        </div>
      ) : null}

      <ExperienceGuide
        title={guide.title}
        detail={guide.detail}
        progressText={`${experienceFlow.progress.completed} / ${experienceFlow.progress.total} 个体验节点`}
        steps={makeGuideSteps(experienceFlow, controller.mode)}
        mode={controller.mode}
        nextActionLabel={experienceFlow.nextAction.kind === 'complete' ? undefined : experienceFlow.nextAction.label}
        onNextAction={experienceFlow.nextAction.kind === 'complete' ? undefined : performNextAction}
        blockerText={experienceBlockerText(experienceFlow)}
      />

      <main id="stage-content" className={`stage-content stage-${controller.view}`} tabIndex={-1}>
        {controller.view === 'review' ? (
          <section className="review-stage" aria-labelledby="review-stage-title">
            <h2 id="review-stage-title" className="sr-only">复核证据</h2>
            <div className="mobile-run-select">
              <label htmlFor="mobile-run">当前记录</label>
              <select id="mobile-run" value={selectedRun.id} onChange={(event) => selectRun(event.currentTarget.value)}>
                {fixture.runs.map((run) => <option key={run.id} value={run.id}>{run.label.replace('Before', '基线').replace('After', '改后')}</option>)}
              </select>
            </div>

            <div className="mobile-review-stepper">
              <div className="mobile-surface-tabs view-toggle" role="tablist" aria-label="移动端复核步骤">
                {mobileSurfaceOrder.map((surface) => (
                  <button
                    key={surface}
                    id={`mobile-tab-${surface}`}
                    type="button"
                    role="tab"
                    aria-selected={mobileSurface === surface}
                    aria-controls={`mobile-panel-${surface}`}
                    tabIndex={mobileSurface === surface ? 0 : -1}
                    onClick={() => switchMobileSurface(surface)}
                  >
                    {mobileSurfaceLabel[surface]}
                  </button>
                ))}
              </div>
              <div className="mobile-step-nav" aria-label="移动端步骤导航">
                <button type="button" disabled={!priorSurface} onClick={() => priorSurface && switchMobileSurface(priorSurface)}><ArrowLeft aria-hidden="true" />上一步</button>
                <span>{activeMobileIndex + 1} / {mobileSurfaceOrder.length}</span>
                <button type="button" disabled={!nextSurface} onClick={() => nextSurface && switchMobileSurface(nextSurface)}>下一步<ArrowRight aria-hidden="true" /></button>
              </div>
            </div>

            <div className="mobile-transport" role="group" aria-label="移动端播放控制">
              <button type="button" aria-label="后退 1 秒" onClick={() => controller.setCurrentTime(Math.max(0, controller.currentTimeMs - 1_000))}><SkipBack aria-hidden="true" /></button>
              <button type="button" aria-label={controller.isPlaying ? '暂停' : '播放'} onClick={() => controller.setPlaying(!controller.isPlaying)}>{controller.isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
              <button type="button" aria-label="前进 1 秒" onClick={() => controller.setCurrentTime(Math.min(selectedRun.durationMs, controller.currentTimeMs + 1_000))}><SkipForward aria-hidden="true" /></button>
              <output aria-live="off">{(controller.currentTimeMs / 1_000).toFixed(2)} / {(selectedRun.durationMs / 1_000).toFixed(2)} 秒</output>
              <input
                type="range"
                min={0}
                max={selectedRun.durationMs}
                step={50}
                value={Math.min(controller.currentTimeMs, selectedRun.durationMs)}
                aria-label="移动端原始来源时间"
                onChange={(event) => controller.setCurrentTime(Number(event.currentTarget.value))}
              />
            </div>

            <div className="workspace-main">
              <RunRail
                fixture={fixture}
                metrics={derived.metrics}
                selectedRunId={selectedRun.id}
                mode={controller.mode}
                reviewedRunIds={controller.experienceInteraction.reviewedRunIds}
                nextRunId={experienceFlow.nextAction.runId}
                onSelect={selectRun}
              />
              <div className="evidence-grid">
                <div
                  id="mobile-panel-source"
                  role="tabpanel"
                  aria-labelledby="mobile-tab-source"
                  tabIndex={-1}
                  className={`surface-slot source-slot${mobileSurface === 'source' ? ' is-mobile-active' : ''}`}
                >
                  <SourceViewer
                    mode={controller.mode}
                    run={selectedRun}
                    zones={controller.zones}
                    source={controller.mode === 'synthetic' ? controller.workbench.scenarios[controller.scenarioId].sources[selectedRun.id] : undefined}
                    localMedia={controller.localMedia}
                    currentTimeMs={controller.currentTimeMs}
                    isPlaying={controller.isPlaying}
                    selectedZoneId={selectedZoneId}
                    onTime={controller.setCurrentTime}
                    onPlaying={controller.setPlaying}
                    onLocalDuration={(assetId, durationMs) => controller.updateLocalDuration(selectedRun.phase, assetId, durationMs)}
                    onLocalDecodeError={(assetId, message) => controller.handleLocalMediaError(selectedRun.phase, assetId, message)}
                    onError={controller.reportError}
                    isExperienceReviewed={runFlow?.interactionReviewed ?? false}
                    onMarkExperienceReviewed={() => controller.markRunExperienceReviewed(selectedRun.id)}
                  />
                </div>
                <div
                  id="mobile-panel-timeline"
                  role="tabpanel"
                  aria-labelledby="mobile-tab-timeline"
                  tabIndex={-1}
                  className={`surface-slot timeline-slot${mobileSurface === 'timeline' ? ' is-mobile-active' : ''}`}
                >
                  <Timeline
                    run={selectedRun}
                    session={session}
                    coverage={selectedCoverage}
                    zones={controller.zones}
                    currentTimeMs={controller.currentTimeMs}
                    selectedObservationId={controller.selectedObservationId}
                    onTime={controller.setCurrentTime}
                    onSelectObservation={controller.selectObservation}
                    onCreate={controller.addObservation}
                  />
                </div>
                <div
                  id="mobile-panel-map"
                  role="tabpanel"
                  aria-labelledby="mobile-tab-map"
                  tabIndex={-1}
                  className={`surface-slot map-slot${mobileSurface === 'map' ? ' is-mobile-active' : ''}`}
                >
                  <WorkstationMap
                    run={selectedRun}
                    session={session}
                    zones={controller.zones}
                    selectedZoneId={selectedZoneId}
                    onSelectZone={(zoneId) => {
                      const record = Object.values(session.observations).find((candidate) => {
                        const payload = effectivePayload(candidate)
                        return payload.source.runId === selectedRun.id && payload.zoneId === zoneId && getObservationState(candidate) !== 'rejected'
                      })
                      if (record) controller.selectObservation(record.candidate.id)
                    }}
                    onAddZone={controller.addZone}
                    onUpdateZone={controller.updateZone}
                  />
                </div>
              </div>
              <div
                id="mobile-panel-evidence"
                role="tabpanel"
                aria-labelledby="mobile-tab-evidence"
                tabIndex={-1}
                className={`surface-slot inspector-slot${mobileSurface === 'evidence' ? ' is-mobile-active' : ''}`}
              >
                <EvidenceInspector
                  run={selectedRun}
                  session={session}
                  zones={controller.zones}
                  selectedObservationId={controller.selectedObservationId}
                  metric={derived.metrics[selectedRun.id]}
                  isRecomputing={controller.isRecomputing}
                  canFinalizeCoverage={canFinalizeCoverage}
                  onSelectObservation={controller.selectObservation}
                  onDispatch={controller.dispatch}
                  onEdit={controller.editObservation}
                  onFinalizeCoverage={() => controller.finalizeCoverage(selectedRun.id)}
                />
              </div>
            </div>
          </section>
        ) : controller.view === 'compare' ? (
          <ComparePanel
            key={`${controller.mode}:${controller.scenarioId}:${fixture.manifest.fixtureId}`}
            fixture={fixture}
            session={session}
            derived={derived}
            reviewedRunCount={experienceFlow.progress.reviewedRuns}
            totalRunCount={experienceFlow.progress.requiredRuns}
            onReturnToReview={() => controller.setView('review')}
            onHypothesis={controller.setHypothesis}
            onDecision={controller.setDecision}
          />
        ) : (
          <ProvenancePanel fixture={fixture} derived={derived} />
        )}
      </main>

      <footer className="status-bar">
        <span aria-live="polite">{controller.liveMessage || '本地会话就绪'}</span>
        <span><Keyboard aria-hidden="true" />Space 播放，方向键步进，Tab 访问全部操作</span>
        <span><Info aria-hidden="true" />仅为合成或本地代码证据</span>
      </footer>
    </div>
  )
}
