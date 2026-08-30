import { FileCode, Fingerprint, LockKey, NetworkSlash } from '@phosphor-icons/react'
import type { FixtureBundle } from '../domain'
import type { DerivedEvidence } from '../app/derive'

export function ProvenancePanel({ fixture, derived }: { readonly fixture: FixtureBundle; readonly derived: DerivedEvidence }) {
  const provenanceLabel = fixture.manifest.provenance === 'user-asserted-unverified'
    ? '用户声明，未验证'
    : fixture.manifest.provenance
  return (
    <section className="provenance-panel" aria-labelledby="provenance-title">
      <div className="compare-heading">
        <div><p className="panel-label">高级证据链</p><h2 id="provenance-title">来源、版本与不能得出的结论</h2></div>
        <span>每个可见数字都回链到 fixture、revision、coverage 与规则版本</span>
      </div>
      <div className="provenance-groups">
        <section><Fingerprint aria-hidden="true" /><h3>Fixture 来源</h3><dl><div><dt>ID</dt><dd>{fixture.manifest.fixtureId}</dd></div><div><dt>来源类型</dt><dd>{provenanceLabel}</dd></div><div><dt>说明</dt><dd>{fixture.manifest.sourceNote}</dd></div></dl></section>
        <section><FileCode aria-hidden="true" /><h3>规则与 trace</h3><dl><div><dt>Schema</dt><dd>{fixture.manifest.schemaVersion}</dd></div><div><dt>已计算 run</dt><dd>{derived.computedMetrics.length}</dd></div><div><dt>规则版本</dt><dd>{derived.computedMetrics[0]?.trace.ruleVersion ?? '暂无'}</dd></div><div><dt>区域 registry</dt><dd>{fixture.zoneRegistry.id} / v{fixture.zoneRegistry.version}</dd></div><div><dt>几何指纹</dt><dd>{fixture.zoneRegistry.geometryFingerprint}</dd></div><div><dt>证据指纹</dt><dd>{derived.claim?.includedEvidenceFingerprint ?? '对比尚未形成'}</dd></div></dl></section>
        <section><NetworkSlash aria-hidden="true" /><h3>网络</h3><p>核心流程不调用远端 API。开发服务器只使用 localhost，生产构建的业务流程没有外部请求。</p></section>
        <section><LockKey aria-hidden="true" /><h3>数据声明</h3><p>这不是加密、安全删除或私人数据处理获批。原型只允许合成、自有或许可清楚的非私人 fixture。</p></section>
      </div>
      <div className="provenance-limitations" role="note">
        <h3>这些结论仍然不成立</h3>
        <p>不能声称需求成立、真实视频可靠、隐私合规、单机位准确、纠错负担可接受、因果改进、产品获批或 production ready。</p>
      </div>
    </section>
  )
}
