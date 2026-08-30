# Contributing to Flow Lens

Thank you for helping improve Flow Lens. This repository is an experimental local portfolio preview, not a validated product or production data tool.

## Safety first

Use only programmatic or clearly generated synthetic fixtures.

Do not attach, commit, paste, or link to media or logs containing real:

- employees, contractors, customers, or bystanders;
- faces, voices, names, addresses, order labels, or account data;
- confidential layouts, inventory, credentials, or commercial processes;
- medical, ergonomic, safety, disciplinary, or performance information.

Issues containing sensitive material may be removed without preserving the attachment. Replace private examples with the smallest deterministic synthetic reproduction.

## Development setup

Requirements: Node.js 22.12 or newer and npm.

```bash
npm ci
npx playwright install chromium
npm run dev
```

## Before opening a pull request

Run the complete local gate:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check:no-egress
npm run e2e
npm run e2e:production
npm run check:public
```

Do not delete a negative assertion, hide a bad case, or add a skip merely to make the suite pass.

## Architecture expectations

- Keep business invariants in pure TypeScript under `src/domain/`.
- Preserve `domain <- fixtures/adapters <- app <- UI` dependency direction.
- Do not duplicate canonical evidence readiness in component-local state.
- Keep manual/no-model operation complete.
- Treat unknown evidence as unknown, never zero.
- Preserve immutable revisions, coverage/zone binding, source identity, guardrails, and current-claim decision binding.
- Do not add network egress, analytics, telemetry, model downloads, remote fonts, or cloud fallback.

Any proposal for CV, AI, 2.5D, 3D, employee monitoring, medical/ergonomic/safety scoring, persistence, export, or real data requires a separate public design decision and is not an ordinary feature contribution.

## Language and claims

Keep user-facing claims descriptive and evidence-bounded. Do not write that Flow Lens improves, optimizes, saves time, identifies causes, recommends the best layout, or is accurate on real video.

## Pull request checklist

- Explain the problem and why the change is within the experimental scope.
- Include a synthetic reproduction and relevant tests.
- State what the evidence does and does not prove.
- Document any new dependency, file format, network behavior, or data surface.
- Update public docs and the changelog when behavior changes.
- Confirm that no private data, local absolute path, secret, or volatile artifact is included.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
