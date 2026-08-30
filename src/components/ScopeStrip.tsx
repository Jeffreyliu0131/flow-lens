import { CloudSlash, Eye, Flask } from '@phosphor-icons/react'

export function ScopeStrip() {
  return (
    <div className="scope-strip" aria-label="原型范围">
      <span><CloudSlash aria-hidden="true" /> 仅在本机</span>
      <span><Eye aria-hidden="true" /> 人工复核</span>
      <span><Flask aria-hidden="true" /> 差值不归因</span>
    </div>
  )
}
