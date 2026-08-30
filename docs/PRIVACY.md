# Privacy and data boundary

Flow Lens defaults to a deterministic programmatic fixture. It contains no real person, employee, customer, order, address, voice, or business process.

## Current behavior

- No account, backend, analytics, telemetry, crash replay, remote font, CDN asset, or application API request.
- No workflow content in localStorage, IndexedDB, cookies, or a service worker.
- Optional local media stays in session-only browser object URLs and is never uploaded by the application.
- Local media is not frame-extracted, transcribed, OCR-processed, thumbnailed, or exported.
- Reset clears application state and controlled object-URL references only.
- Production CSP blocks runtime connections with `connect-src 'none'`.

## Do not use real private media

Do not select or attach video, images, logs, or screenshots containing:

- employees, contractors, bystanders, or customers;
- names, faces, voices, addresses, order labels, or account details;
- confidential layouts, inventory, commercial processes, or credentials;
- medical, ergonomic, safety, disciplinary, or performance information.

Use the programmatic fixture or the committed generated WebM lifecycle fixture when reporting a bug.

## What “local” does not prove

A browser object URL does not prove encryption, host isolation, secure deletion, backup deletion, legal permission, or privacy compliance. Flow Lens does not control the source folder, browser cache implementation, operating-system previews, swap, backups, other local processes, or files copied outside the application.

This repository is an experimental portfolio preview, not an approved tool for participant research, employee monitoring, or production data processing.
