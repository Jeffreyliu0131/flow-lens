# Security policy

## Supported versions

Flow Lens is an experimental local preview with no production release or service-level commitment.

| Version | Supported |
|---|---|
| Current `main` | Best-effort security fixes |
| Older commits or forks | Not supported |

## Report a vulnerability

Use GitHub's private security advisory flow for `Jeffreyliu0131/flow-lens`:

`https://github.com/Jeffreyliu0131/flow-lens/security/advisories/new`

Do not open a public issue for a vulnerability that contains exploit details, credentials, private paths, or sensitive data. Include the affected commit, impact, minimal synthetic reproduction, and a suggested mitigation when available.

This volunteer project provides no guaranteed response or remediation time. The maintainer will acknowledge and assess reports on a best-effort basis.

## Data handling boundary

Never send real participant, employee, customer, order, address, voice, or private video data as part of a security report. Use generated or programmatic fixtures. If the issue can only be demonstrated with private material, describe the structure and impact without transmitting the material.

## Current security posture

- Static local application; no backend, account, telemetry, or application API.
- Production CSP uses `connect-src 'none'`.
- Automated checks cover connection APIs, secret-like patterns, tracked public files, and local-media object-URL lifecycle.
- The optional local-media path is not a secure storage, deletion, rights, or privacy-compliance system.

See [docs/PRIVACY.md](docs/PRIVACY.md) and [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).
