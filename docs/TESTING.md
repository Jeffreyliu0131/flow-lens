# Testing

## Local quality gate

Use Node.js 22.12 or newer.

```bash
npm ci
npx playwright install chromium
npm run lint
npm run typecheck
npm test
npm run build
npm run check:no-egress
npm run e2e
npm run e2e:production
npm run check:public
```

## What the tests cover

- immutable observation revisions and restore;
- runtime fixture, source, run, asset, range, enum, zone, and provenance checks;
- full-coverage and unknown-to-zero blocking;
- exact 3+3 experience flow and controller action gates;
- work-unit, observability, guardrail, and source-label comparison blockers;
- current-claim decision binding and stale-decision recovery;
- local-media object-URL lifecycle and 1+1 limit;
- first-run, desktop workbench, mobile stepper, keyboard focus, dialog errors, reduced motion, forced colors, and serious/critical axe checks;
- production CSP and connection-API fail-closed probes;
- tracked-file public allowlist, absolute-path, secret-pattern, large-file, and license checks.

Playwright output, coverage reports, audit JSON, generated builds, and volatile screenshots are intentionally ignored. Only the three stable synthetic screenshots in `docs/assets/` are versioned.

## Evidence boundary

Passing tests proves the behavior of the tested code and synthetic/generated fixtures. It does not prove unfamiliar-user understanding, target-user demand, real-video reliability, annotation correctness, privacy compliance, causal improvement, or production readiness.
