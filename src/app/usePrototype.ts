import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  applySessionCommand,
  createDomainSession,
  createVersionedZoneRegistry,
  type CandidateObservation,
  type DecisionOutcome,
  type DomainSession,
  type EventKind,
  type FixtureBundle,
  type ObservationPayload,
  type SessionCommand,
  type ZoneDefinition,
} from '../domain'
import { LocalMediaSession, type LocalMediaSnapshot, type MediaSlot } from '../adapters'
import { createSyntheticWorkbench, type SyntheticScenarioId } from '../fixtures'
import { createLocalFixture, finalizeLocalCoverage } from './localFixture'
import { effectivePayload } from './observationSelectors'
import { nextUiId } from './idFactory'
import { deriveEvidence } from './derive'
import {
  createExperienceInteractionState,
  deriveExperienceFlow,
  reduceExperienceInteraction,
  type ExperienceInteractionState,
} from './experienceFlow'
import {
  acceptLocalDuration,
  clearLocalAsset,
  localDurationValues,
  registerLocalAsset,
  type LocalDurationRegistry,
} from './localDurationRegistry'

export type AppPhase = 'empty' | 'loading' | 'ready' | 'error'
export type WorkspaceMode = 'synthetic' | 'local'
export type WorkspaceView = 'review' | 'compare' | 'provenance'

interface InitialRequest {
  readonly phase: AppPhase
  readonly error: string | null
  readonly autoDemo: boolean
  readonly scenarioId: SyntheticScenarioId
}

const SCENARIO_IDS: readonly SyntheticScenarioId[] = [
  'eligible',
  'coverage-gap',
  'incomparable',
  'observability-shift',
  'guardrail-harm',
  'source-mismatch',
]

function readInitialRequest(): InitialRequest {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('scenario') as SyntheticScenarioId | null
  const scenarioId = requested !== null && SCENARIO_IDS.includes(requested) ? requested : 'eligible'
  if (params.get('state') === 'loading') {
    return { phase: 'loading', error: null, autoDemo: false, scenarioId }
  }
  if (params.get('state') === 'error') {
    return {
      phase: 'error',
      error: '无法解析这个本地 fixture。请选择另一文件或载入合成演示。',
      autoDemo: false,
      scenarioId,
    }
  }
  return { phase: 'empty', error: null, autoDemo: params.get('demo') === '1', scenarioId }
}

const INITIAL_REQUEST = readInitialRequest()

export interface PrototypeController {
  readonly phase: AppPhase
  readonly mode: WorkspaceMode
  readonly view: WorkspaceView
  readonly scenarioId: SyntheticScenarioId
  readonly fixture: FixtureBundle | null
  readonly session: DomainSession | null
  readonly zones: readonly ZoneDefinition[]
  readonly selectedRunId: string | null
  readonly selectedObservationId: string | null
  readonly currentTimeMs: number
  readonly isPlaying: boolean
  readonly isRecomputing: boolean
  readonly localMedia: LocalMediaSnapshot
  readonly error: string | null
  readonly liveMessage: string
  readonly experienceInteraction: ExperienceInteractionState
  readonly workbench: ReturnType<typeof createSyntheticWorkbench>
  loadSynthetic(scenarioId?: SyntheticScenarioId): void
  clearSession(): void
  setView(view: WorkspaceView): void
  setScenario(scenarioId: SyntheticScenarioId): void
  acknowledgeExperienceScope(): void
  markRunExperienceReviewed(runId: string): void
  selectRun(runId: string): void
  selectObservation(observationId: string): void
  setCurrentTime(timeMs: number): void
  setPlaying(isPlaying: boolean): void
  dispatch(command: SessionCommand, message: string): boolean
  editObservation(observationId: string, payload: ObservationPayload): boolean
  addObservation(input: { zoneId: string; startMs: number; endMs: number; eventKind: EventKind }): string | null
  addZone(zone: ZoneDefinition): void
  updateZone(zone: ZoneDefinition): void
  setLocalFile(slot: MediaSlot, file: File): boolean
  updateLocalDuration(slot: MediaSlot, assetId: string, durationMs: number): void
  handleLocalMediaError(slot: MediaSlot, assetId: string, message: string): void
  finalizeCoverage(runId: string): void
  setHypothesis(text: string): boolean
  setDecision(outcome: DecisionOutcome): boolean
  reportError(message: string): void
}

function invalidateCoverageForZoneChange(
  fixture: FixtureBundle,
  previousZoneGeometryFingerprint: string,
): FixtureBundle {
  return {
    ...fixture,
    coverages: Object.fromEntries(fixture.runs.map((run) => {
      const prior = fixture.coverages[run.id]
      return [run.id, {
        id: `coverage:${run.id}:zone-change:v${(prior?.version ?? 0) + 1}`,
        runId: run.id,
        version: (prior?.version ?? 0) + 1,
        runDurationMs: run.durationMs,
        reviewedIntervals: [],
        unknownIntervals: [],
        unreviewedIntervals: [{ startMs: 0, endMs: run.durationMs }],
        candidateIndependentSweep: false,
        finalized: false,
        zoneGeometryFingerprint: previousZoneGeometryFingerprint,
      }]
    })),
  }
}

export function usePrototype(): PrototypeController {
  const workbench = useMemo(() => createSyntheticWorkbench(), [])
  const mediaSessionRef = useRef<LocalMediaSession | null>(null)
  if (mediaSessionRef.current === null) {
    mediaSessionRef.current = new LocalMediaSession()
  }
  const loadingTimerRef = useRef<number | null>(null)
  const recomputeTimerRef = useRef<number | null>(null)
  const localDurationRef = useRef<LocalDurationRegistry>({})
  const [phase, setPhase] = useState<AppPhase>(INITIAL_REQUEST.phase)
  const [mode, setMode] = useState<WorkspaceMode>('synthetic')
  const [view, setView] = useState<WorkspaceView>('review')
  const [scenarioId, setScenarioId] = useState<SyntheticScenarioId>('eligible')
  const [fixture, setFixture] = useState<FixtureBundle | null>(null)
  const [session, setSession] = useState<DomainSession | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [isPlaying, setPlaying] = useState(false)
  const [isRecomputing, setRecomputing] = useState(false)
  const [localMedia, setLocalMedia] = useState<LocalMediaSnapshot>({})
  const [error, setError] = useState<string | null>(INITIAL_REQUEST.error)
  const [liveMessage, setLiveMessage] = useState('')
  const [experienceInteraction, dispatchExperience] = useReducer(
    reduceExperienceInteraction,
    undefined,
    createExperienceInteractionState,
  )
  const zones = useMemo(
    () => session?.zoneRegistry.zones ?? fixture?.zoneRegistry.zones ?? [],
    [fixture?.zoneRegistry, session?.zoneRegistry],
  )

  const nextMeta = useCallback((prefix: string) => {
    return {
      id: nextUiId(prefix),
      actorId: 'local-operator',
      atMs: Date.now(),
    }
  }, [])

  const startRecompute = useCallback(() => {
    setRecomputing(true)
    if (recomputeTimerRef.current !== null) {
      window.clearTimeout(recomputeTimerRef.current)
    }
    recomputeTimerRef.current = window.setTimeout(() => {
      setRecomputing(false)
      setLiveMessage('已根据最终证据重新计算。')
    }, 80)
  }, [])

  const activateSynthetic = useCallback((nextScenarioId: SyntheticScenarioId) => {
    const scenario = workbench.scenarios[nextScenarioId]
    setMode('synthetic')
    setScenarioId(nextScenarioId)
    setFixture(scenario.fixture)
    setSession(scenario.session)
    setSelectedRunId(scenario.fixture.runs[0]?.id ?? null)
    setSelectedObservationId(Object.keys(scenario.session.observations)[0] ?? null)
    setCurrentTimeMs(0)
    setPlaying(false)
    setView('review')
    dispatchExperience({ type: 'reset' })
    setError(null)
    setPhase('ready')
    setLiveMessage(`已载入合成场景：${scenario.label}`)
  }, [workbench])

  const loadSynthetic = useCallback((nextScenarioId: SyntheticScenarioId = 'eligible') => {
    if (loadingTimerRef.current !== null) window.clearTimeout(loadingTimerRef.current)
    setPhase('loading')
    setError(null)
    setLiveMessage('正在本地载入合成 fixture。')
    loadingTimerRef.current = window.setTimeout(() => {
      activateSynthetic(nextScenarioId)
    }, 360)
  }, [activateSynthetic])

  const clearSession = useCallback(() => {
    if (loadingTimerRef.current !== null) window.clearTimeout(loadingTimerRef.current)
    if (recomputeTimerRef.current !== null) window.clearTimeout(recomputeTimerRef.current)
    mediaSessionRef.current?.clearAll()
    localDurationRef.current = {}
    setLocalMedia({})
    setFixture(null)
    setSession(null)
    setSelectedRunId(null)
    setSelectedObservationId(null)
    setCurrentTimeMs(0)
    setPlaying(false)
    setRecomputing(false)
    setError(null)
    setPhase('empty')
    dispatchExperience({ type: 'reset' })
    setLiveMessage('已清除应用会话引用。未声明物理安全删除。')
  }, [])

  const setScenario = useCallback((nextScenarioId: SyntheticScenarioId) => {
    activateSynthetic(nextScenarioId)
  }, [activateSynthetic])

  const selectRun = useCallback((runId: string) => {
    setSelectedRunId(runId)
    const firstRecord = session === null
      ? undefined
      : Object.values(session.observations)
          .filter((record) => record.candidate.payload.source.runId === runId)
          .sort(
            (left, right) =>
              effectivePayload(left).source.startMs -
              effectivePayload(right).source.startMs,
          )[0]
    setSelectedObservationId(firstRecord?.candidate.id ?? null)
    setCurrentTimeMs(
      firstRecord === undefined ? 0 : effectivePayload(firstRecord).source.startMs,
    )
    setPlaying(false)
  }, [session])

  const acknowledgeExperienceScope = useCallback(() => {
    dispatchExperience({ type: 'acknowledge-scope' })
    setLiveMessage(
      mode === 'synthetic'
        ? '已确认当前是合成体验，差值不能归因于改动。'
        : '已确认本地来源未经验证，1+1 不能完成 3+3。',
    )
  }, [mode])

  const markRunExperienceReviewed = useCallback((runId: string) => {
    if (fixture?.runs.some((run) => run.id === runId) !== true) return
    dispatchExperience({ type: 'mark-run-reviewed', runId })
    setLiveMessage('已记录此记录的体验检查。规范证据未改变。')
  }, [fixture?.runs])

  const selectObservation = useCallback((observationId: string) => {
    setSelectedObservationId(observationId)
    const record = session?.observations[observationId]
    const source = record ? effectivePayload(record).source : undefined
    if (source !== undefined) setCurrentTimeMs(source.startMs)
  }, [session])

  const dispatch = useCallback((command: SessionCommand, message: string): boolean => {
    if (session === null) return false
    const result = applySessionCommand(session, command)
    if (!result.ok) {
      setError(`${result.error.code}: ${result.error.message}`)
      setLiveMessage('操作未完成，证据状态未改变。')
      return false
    }
    setSession(result.value)
    if ('observationId' in command) {
      const updatedRecord = result.value.observations[command.observationId]
      if (updatedRecord !== undefined) {
        setSelectedObservationId(command.observationId)
        setCurrentTimeMs(effectivePayload(updatedRecord).source.startMs)
      }
    }
    setError(null)
    setLiveMessage(message)
    startRecompute()
    return true
  }, [session, startRecompute])

  const addObservation = useCallback((input: {
    zoneId: string
    startMs: number
    endMs: number
    eventKind: EventKind
  }) => {
    if (fixture === null || session === null) return null
    const run = fixture.runs.find((candidate) => candidate.id === selectedRunId)
    if (run === undefined) return null
    const id = nextUiId('observation')
    const candidate: CandidateObservation = {
      id,
      producer: 'human',
      state: 'proposed',
      payload: {
        source: {
          fixtureId: fixture.manifest.fixtureId,
          assetId: run.source.assetId,
          runId: run.id,
          startMs: input.startMs,
          endMs: input.endMs,
        },
        zoneId: input.zoneId,
        eventType: 'HAND_ZONE_PRESENCE_INTERVAL',
        eventKind: input.eventKind,
      },
    }
    const result = applySessionCommand(session, {
      type: 'register-candidate',
      candidate,
    })
    if (!result.ok) {
      setError(result.error.message)
      return null
    }
    setSession(result.value)
    setSelectedObservationId(id)
    setLiveMessage('已创建待复核观察，尚未进入指标。')
    startRecompute()
    return id
  }, [fixture, selectedRunId, session, startRecompute])

  const editObservation = useCallback((observationId: string, payload: ObservationPayload): boolean => {
    if (session === null) return false
    const startResult = applySessionCommand(session, {
      type: 'start-edit',
      observationId,
      ...nextMeta('edit-start'),
    })
    if (!startResult.ok) {
      setError(startResult.error.message)
      return false
    }
    const updateResult = applySessionCommand(startResult.value, {
      type: 'update-edit',
      observationId,
      payload,
      ...nextMeta('edit-update'),
    })
    if (!updateResult.ok) {
      setError(updateResult.error.message)
      return false
    }
    const finalResult = applySessionCommand(updateResult.value, {
      type: 'finalize-edit',
      observationId,
      ...nextMeta('edit-finalize'),
    })
    if (!finalResult.ok) {
      setError(finalResult.error.message)
      return false
    }
    setSession(finalResult.value)
    setSelectedObservationId(observationId)
    setCurrentTimeMs(payload.source.startMs)
    setError(null)
    setLiveMessage('修订已最终确认，旧版本保留在历史中。')
    startRecompute()
    return true
  }, [nextMeta, session, startRecompute])

  const addZone = useCallback((zone: ZoneDefinition) => {
    if (session === null || fixture === null) return
    const registryResult = createVersionedZoneRegistry({
      id: `${session.zoneRegistry.id}:v${session.zoneRegistry.version + 1}`,
      fixtureId: session.fixtureId,
      version: session.zoneRegistry.version + 1,
      zones: [...session.zoneRegistry.zones, zone],
    })
    if (!registryResult.ok) {
      setError(registryResult.error.message)
      return
    }
    const sessionResult = applySessionCommand(session, { type: 'replace-zone-registry', zoneRegistry: registryResult.value })
    if (!sessionResult.ok) {
      setError(sessionResult.error.message)
      return
    }
    setSession(sessionResult.value)
    setFixture(invalidateCoverageForZoneChange({ ...fixture, zoneRegistry: registryResult.value }, fixture.zoneRegistry.geometryFingerprint))
    setLiveMessage(`已圈定区域：${zone.label}`)
    startRecompute()
  }, [fixture, session, startRecompute])

  const updateZone = useCallback((zone: ZoneDefinition) => {
    if (session === null || fixture === null) return
    const registryResult = createVersionedZoneRegistry({
      id: `${session.zoneRegistry.id}:v${session.zoneRegistry.version + 1}`,
      fixtureId: session.fixtureId,
      version: session.zoneRegistry.version + 1,
      zones: session.zoneRegistry.zones.map((candidate) => candidate.id === zone.id ? zone : candidate),
    })
    if (!registryResult.ok) {
      setError(registryResult.error.message)
      return
    }
    const sessionResult = applySessionCommand(session, { type: 'replace-zone-registry', zoneRegistry: registryResult.value })
    if (!sessionResult.ok) {
      setError(sessionResult.error.message)
      return
    }
    setSession(sessionResult.value)
    setFixture(invalidateCoverageForZoneChange({ ...fixture, zoneRegistry: registryResult.value }, fixture.zoneRegistry.geometryFingerprint))
    setLiveMessage(`已更新区域：${zone.label}`)
    startRecompute()
  }, [fixture, session, startRecompute])

  const rebuildLocalFixture = useCallback((snapshot: LocalMediaSnapshot, durations: Readonly<Record<MediaSlot, number>>, nextZones: readonly ZoneDefinition[]) => {
    const nextFixture = createLocalFixture(snapshot, durations, nextZones)
    setFixture(nextFixture)
    setSession(createDomainSession(nextFixture.manifest.fixtureId, nextFixture.zoneRegistry))
    setMode('local')
    setSelectedRunId(nextFixture.runs[0]?.id ?? null)
    setSelectedObservationId(null)
    setCurrentTimeMs(0)
    setPlaying(false)
    setView('review')
    setPhase('ready')
    dispatchExperience({ type: 'reset' })
  }, [])

  const setLocalFile = useCallback((slot: MediaSlot, file: File): boolean => {
    const result = mediaSessionRef.current?.set(slot, file)
    if (result === undefined || !result.ok) {
      const message = result?.error.message ?? '本地视频无法打开。'
      setError(message)
      setPhase('error')
      setLiveMessage('本地文件不受支持，未创建会话素材。')
      return false
    }
    const snapshot = mediaSessionRef.current?.snapshot() ?? {}
    localDurationRef.current = registerLocalAsset(localDurationRef.current, slot, result.value.assetId)
    setLocalMedia(snapshot)
    const nextZones = zones.length > 0 ? zones : workbench.scenarios.eligible.fixture.zoneRegistry.zones
    rebuildLocalFixture(snapshot, localDurationValues(snapshot, localDurationRef.current), nextZones)
    setError(null)
    setLiveMessage('本地视频只保留在当前浏览器会话，未上传。')
    return true
  }, [rebuildLocalFixture, workbench, zones])

  const updateLocalDuration = useCallback((slot: MediaSlot, assetId: string, durationMs: number) => {
    const currentHandle = mediaSessionRef.current?.get(slot)
    const accepted = acceptLocalDuration(localDurationRef.current, slot, currentHandle?.assetId, assetId, durationMs)
    if (!accepted.accepted) return
    localDurationRef.current = accepted.registry
    const snapshot = mediaSessionRef.current?.snapshot() ?? {}
    const nextFixture = createLocalFixture(snapshot, localDurationValues(snapshot, localDurationRef.current), zones, session?.zoneRegistry.version ?? 1)
    setFixture(nextFixture)
    setSelectedRunId((prior) => prior ?? nextFixture.runs[0]?.id ?? null)
  }, [session?.zoneRegistry.version, zones])

  const handleLocalMediaError = useCallback((slot: MediaSlot, assetId: string, message: string) => {
    const currentHandle = mediaSessionRef.current?.get(slot)
    if (currentHandle?.assetId !== assetId) return
    mediaSessionRef.current?.clear(slot)
    localDurationRef.current = clearLocalAsset(localDurationRef.current, slot)
    const snapshot = mediaSessionRef.current?.snapshot() ?? {}
    setLocalMedia(snapshot)
    setError(message)
    setLiveMessage('失败的视频引用已撤销。可选择替代视频或切换到合成演示。')
    const nextZones = zones.length > 0 ? zones : workbench.scenarios.eligible.fixture.zoneRegistry.zones
    if (snapshot.before === undefined && snapshot.after === undefined) {
      setFixture(null)
      setSession(null)
      setSelectedRunId(null)
      setSelectedObservationId(null)
      setPlaying(false)
      setPhase('error')
      return
    }
    rebuildLocalFixture(snapshot, localDurationValues(snapshot, localDurationRef.current), nextZones)
    setPhase('ready')
  }, [rebuildLocalFixture, workbench, zones])

  const finalizeCoverage = useCallback((runId: string) => {
    if (fixture === null) return
    setFixture(finalizeLocalCoverage(fixture, runId))
    setLiveMessage('已标记全程人工复核。完整覆盖不代表事件绝对正确。')
    startRecompute()
  }, [fixture, startRecompute])

  const setHypothesis = useCallback((text: string): boolean => {
    if (session === null || fixture === null) return false
    const diagnostics = mode === 'synthetic'
      ? {
          expectedProvenance: 'synthetic' as const,
          syntheticSources: workbench.scenarios[scenarioId].sources,
        }
      : { expectedProvenance: 'user-asserted-unverified' as const }
    const evidence = deriveEvidence(fixture, session, diagnostics)
    const flow = deriveExperienceFlow({
      phase,
      mode,
      fixture,
      session,
      derived: evidence,
      interaction: experienceInteraction,
    })
    if (!flow.reviewComplete || !flow.comparisonReady) {
      setError('证据对比尚未形成，不能锁定改动。')
      setLiveMessage('改动未锁定：先完成 3+3 体验检查并解除证据阻断。')
      return false
    }
    const draftMeta = nextMeta('hypothesis-draft')
    const draftResult = applySessionCommand(session, {
      type: 'set-hypothesis-draft',
      text,
      ...draftMeta,
    })
    if (!draftResult.ok) {
      setError(draftResult.error.message)
      return false
    }
    const lockMeta = nextMeta('hypothesis-lock')
    const lockResult = applySessionCommand(draftResult.value, {
      type: 'lock-hypothesis',
      ...lockMeta,
    })
    if (!lockResult.ok) {
      setError(lockResult.error.message)
      return false
    }
    setSession(lockResult.value)
    setError(null)
    setLiveMessage('已锁定一条由用户提出的可逆改动。')
    return true
  }, [experienceInteraction, fixture, mode, nextMeta, phase, scenarioId, session, workbench.scenarios])

  const setDecision = useCallback((outcome: DecisionOutcome): boolean => {
    if (session === null || fixture === null) return false
    const diagnostics = mode === 'synthetic'
      ? {
          expectedProvenance: 'synthetic' as const,
          syntheticSources: workbench.scenarios[scenarioId].sources,
        }
      : { expectedProvenance: 'user-asserted-unverified' as const }
    const evidence = deriveEvidence(fixture, session, diagnostics)
    const flow = deriveExperienceFlow({
      phase,
      mode,
      fixture,
      session,
      derived: evidence,
      interaction: experienceInteraction,
    })
    if (
      !flow.reviewComplete ||
      !flow.comparisonReady ||
      flow.currentClaimEvidenceFingerprint === null
    ) {
      setError('当前没有可展示的主张包（ClaimPackage），不能记录决定。')
      setLiveMessage('决定未记录：证据或对比条件仍被阻断。')
      return false
    }
    const meta = nextMeta('decision')
    return dispatch({
      type: 'set-decision',
      outcome,
      claimEvidenceFingerprint: flow.currentClaimEvidenceFingerprint,
      ...meta,
    }, '已记录用户决定，系统没有推荐答案。')
  }, [dispatch, experienceInteraction, fixture, mode, nextMeta, phase, scenarioId, session, workbench.scenarios])

  const reportError = useCallback((message: string) => {
    setError(message)
    setLiveMessage(message)
  }, [])

  useEffect(() => {
    if (!INITIAL_REQUEST.autoDemo) return
    const timer = window.setTimeout(() => loadSynthetic(INITIAL_REQUEST.scenarioId), 0)
    return () => window.clearTimeout(timer)
  }, [loadSynthetic])

  useEffect(() => () => {
    if (loadingTimerRef.current !== null) window.clearTimeout(loadingTimerRef.current)
    if (recomputeTimerRef.current !== null) window.clearTimeout(recomputeTimerRef.current)
    mediaSessionRef.current?.dispose()
  }, [])

  return {
    phase,
    mode,
    view,
    scenarioId,
    fixture,
    session,
    zones,
    selectedRunId,
    selectedObservationId,
    currentTimeMs,
    isPlaying,
    isRecomputing,
    localMedia,
    error,
    liveMessage,
    experienceInteraction,
    workbench,
    loadSynthetic,
    clearSession,
    setView,
    setScenario,
    acknowledgeExperienceScope,
    markRunExperienceReviewed,
    selectRun,
    selectObservation,
    setCurrentTime: setCurrentTimeMs,
    setPlaying,
    dispatch,
    editObservation,
    addObservation,
    addZone,
    updateZone,
    setLocalFile,
    updateLocalDuration,
    handleLocalMediaError,
    finalizeCoverage,
    setHypothesis,
    setDecision,
    reportError,
  }
}
