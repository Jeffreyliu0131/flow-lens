## Summary

Describe the scoped change and why it belongs in the experimental local preview.

## Synthetic reproduction

List the fixture/scenario, steps, expected behavior, and negative cases. Do not attach real private media.

## Evidence boundary

State what this change and its tests do **not** prove.

## Checklist

- [ ] I used only programmatic or generated synthetic fixtures.
- [ ] I included no employees, customers, orders, addresses, voices, private videos, credentials, local absolute paths, or confidential process material.
- [ ] Domain invariants remain in `src/domain/`; UI state does not duplicate canonical evidence readiness.
- [ ] Unknown evidence is not converted to zero, and descriptive differences are not presented as causal improvement.
- [ ] Manual/no-model behavior remains complete; no network egress or silent cloud fallback was added.
- [ ] New dependencies, formats, data surfaces, and network behavior are documented.
- [ ] Relevant negative, accessibility, and responsive tests were added or updated.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run check:no-egress`, `npm run e2e`, `npm run e2e:production`, and `npm run check:public` pass.
- [ ] Public docs and `CHANGELOG.md` are updated when behavior changes.
