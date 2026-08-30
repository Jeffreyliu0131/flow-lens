export function LoadingWorkspace() {
  return (
    <main className="loading-workspace" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在本地载入合成夹具，没有上传。</span>
      <div className="skeleton appbar-skeleton" />
      <div className="skeleton rail-skeleton" />
      <div className="skeleton viewer-skeleton" />
      <div className="skeleton timeline-skeleton" />
      <div className="skeleton map-skeleton" />
      <div className="skeleton inspector-skeleton" />
    </main>
  )
}
