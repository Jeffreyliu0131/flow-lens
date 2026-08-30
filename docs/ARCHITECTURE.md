# Architecture

Flow Lens is a Vite + React + TypeScript static single-page application. It has no backend, database, account system, analytics client, model download, or required network service.

## Dependency direction

```text
domain <- fixtures / adapters <- application controller <- UI
```

- `src/domain/` contains pure TypeScript state, commands, invariants, coverage, metrics, comparison, and claim construction. It imports neither React nor browser APIs.
- `src/fixtures/` provides deterministic programmatic sources and deliberately blocked scenarios.
- `src/adapters/` contains the session-only local-media adapter and the removable `NullAdapter` model port.
- `src/app/` composes domain state, deterministic derived evidence, and a small experience-flow selector.
- `src/components/` renders the interface and issues commands; it does not calculate authoritative metrics.

## Evidence invariants

- A candidate becomes canonical only after an explicit human command.
- Only active `confirmed` or `edited-final` revisions enter metrics.
- Edit and restore append immutable revisions; history is not overwritten.
- A full-run metric requires finalized, candidate-independent, complete coverage with no unknown interval.
- Coverage is bound to a versioned zone-geometry fingerprint. A zone change invalidates dependent output until re-review.
- Runtime checks bind observations to the exact fixture, source asset, run, finite time range, event enum, and known zone.
- Comparison requires exactly three Before and three After records in the guided synthetic experience, compatible work-unit signatures, stable observability, a non-empty guardrail set with every guardrail complete, runtime-valid, and explicitly `ok`, current metrics, and source-label consistency.
- Claim packages remain descriptive and set attribution to `not-established`.
- A decision is current only for the active locked change and the exact current claim-evidence fingerprint.

## Experience state

The experience reducer stores only facts that cannot be reconstructed from evidence: whether the scope was acknowledged and which run records the user explicitly inspected. Metric, coverage, comparison, hypothesis, and decision readiness are always re-derived from canonical evidence.

Opening the Compare view early is read-only exploration. Before all six guided records are complete, comparison values and trace are not rendered, and the controller independently rejects hypothesis and decision commands.

## Rendering

The application uses Radix Themes plus semantic HTML and functional SVG. The procedural source, timeline, and workstation map are data-bound interface surfaces, not generated analysis or camera footage.

There is no Canvas, WebGL, continuous trajectory, 2.5D, 3D, pose estimation, or computer vision.

## Local media adapter

The optional local path accepts at most one Before and one After `video/*` file per browser session. It creates object URLs in memory, revokes them on replacement/error/reset/unmount, and does not extract frames, OCR, audio, thumbnails, or filesystem paths.

Local mode is a source viewer, not a valid 3+3 comparison path. User assertions about ownership or permission are displayed as unverified.

## Network boundary

The production Content Security Policy uses `connect-src 'none'`. Source checks reject application fetch, XHR, WebSocket, EventSource, beacon, browser content persistence, external URLs, and secret-like patterns. Development permits localhost only for Vite tooling.

Passing these controls is implementation evidence for this static preview. It is not a production security review or proof that a host device is private.
