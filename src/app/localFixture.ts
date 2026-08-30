import {
  DOMAIN_SCHEMA_VERSION,
  type FixtureBundle,
  type ReviewCoverage,
  type RunRecord,
  type VersionedZoneRegistry,
  type WorkUnitSignature,
  type ZoneDefinition,
  createVersionedZoneRegistry,
} from '../domain'
import type { LocalMediaSnapshot, MediaSlot } from '../adapters'

const signature: WorkUnitSignature = {
  id: 'local:same-sku:v1',
  skuAlias: '本地同一 SKU',
  taskBoundary: '一次固定工位打包，从空箱到封箱完成',
  materials: ['用户声明为合成、自有或许可清楚的非私人素材'],
  completionRule: '由用户在会话内定义完成边界',
  version: 1,
}

function makeRun(
  slot: MediaSlot,
  snapshot: LocalMediaSnapshot,
  durationMs: number,
): RunRecord | null {
  const handle = snapshot[slot]
  if (handle === undefined) return null
  const id = `local-${slot}`
  return {
    id,
    label: slot === 'before' ? '本地基线' : '本地改后',
    phase: slot,
    order: 1,
    durationMs,
    source: {
      fixtureId: 'fixture:local-session',
      assetId: handle.assetId,
      runId: id,
      startMs: 0,
      endMs: durationMs,
    },
    signature,
    comparability: 'eligible',
    observability: 'unknown',
    guardrails: [
      {
        id: `${id}:guardrail`,
        label: '质量与完整性',
        state: 'unknown',
        note: '本地素材尚未形成可比较的 guardrail 证据。',
      },
    ],
  }
}

function emptyCoverage(run: RunRecord, zoneGeometryFingerprint: string): ReviewCoverage {
  return {
    id: `coverage:${run.id}:local:v1`,
    runId: run.id,
    version: 1,
    runDurationMs: run.durationMs,
    reviewedIntervals: [],
    unknownIntervals: [],
    unreviewedIntervals: [{ startMs: 0, endMs: run.durationMs }],
    candidateIndependentSweep: false,
    finalized: false,
    zoneGeometryFingerprint,
  }
}

export function createLocalFixture(
  snapshot: LocalMediaSnapshot,
  durations: Readonly<Record<MediaSlot, number>>,
  zones: readonly ZoneDefinition[],
  registryVersion = 1,
): FixtureBundle {
  const runs = (['before', 'after'] as const)
    .map((slot) => makeRun(slot, snapshot, durations[slot]))
    .filter((run): run is RunRecord => run !== null)

  const zoneRegistryResult = createVersionedZoneRegistry({
    id: `zone-registry:local:v${registryVersion}`,
    fixtureId: 'fixture:local-session',
    version: registryVersion,
    zones,
  })
  if (!zoneRegistryResult.ok) {
    throw new Error(`${zoneRegistryResult.error.code}: ${zoneRegistryResult.error.message}`)
  }
  const zoneRegistry: VersionedZoneRegistry = zoneRegistryResult.value

  return {
    manifest: {
      schemaVersion: DOMAIN_SCHEMA_VERSION,
      fixtureId: 'fixture:local-session',
      seed: 'none',
      title: '会话内本地素材',
      provenance: 'user-asserted-unverified',
      sourceNote:
        '来源仅由当前用户声明，未由 Flow Lens 验证。禁止参与者、员工或其他私人素材。',
      privateDataForbidden: true,
    },
    zoneRegistry,
    runs,
    coverages: Object.fromEntries(
      runs.map((run) => [run.id, emptyCoverage(run, zoneRegistry.geometryFingerprint)]),
    ),
  }
}

export function finalizeLocalCoverage(
  fixture: FixtureBundle,
  runId: string,
): FixtureBundle {
  const run = fixture.runs.find((candidate) => candidate.id === runId)
  if (run === undefined) return fixture
  const prior = fixture.coverages[runId]
  if (prior === undefined) return fixture
  return {
    ...fixture,
    coverages: {
      ...fixture.coverages,
      [runId]: {
        ...prior,
        id: `${prior.id}:final`,
        version: prior.version + 1,
        reviewedIntervals: [{ startMs: 0, endMs: run.durationMs }],
        unknownIntervals: [],
        unreviewedIntervals: [],
        candidateIndependentSweep: true,
        finalized: true,
        zoneGeometryFingerprint: fixture.zoneRegistry.geometryFingerprint,
      },
    },
  }
}
