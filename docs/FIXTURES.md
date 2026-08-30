# Fixtures and asset provenance

## Programmatic fixture

The default `flow-lens-portfolio-v1` fixture is generated deterministically by:

- `src/fixtures/syntheticWorkbench.ts`
- `src/fixtures/syntheticSource.ts`

It contains exactly three Before and three After records, four hand-defined zones, entry/dwell/revisit observations, a low-confidence candidate, rejected and uncertain cases, and deliberately blocked scenarios for:

- incomplete coverage;
- incomparable work-unit signatures;
- observability shift;
- guardrail harm;
- source-label mismatch.

The procedural source schedule is generated independently from review labels, allowing source-label mismatches to fail closed. It is not camera footage, a model output, an accuracy benchmark, or a dataset of real work.

Machine-readable provenance is stored at `public/fixtures/flow-lens-synthetic-v1.provenance.json`.

## Generated local-media lifecycle fixture

`artifacts/fixtures/synthetic-local-valid.webm` is a one-second, silent VP9 test pattern generated from FFmpeg `lavfi testsrc` at 320×180 and 10 fps.

SHA-256:

```text
3608868e64124b933657459805d3a9fb5293d2576305af2db2db889d7dab1b06
```

It exists only to test browser decode, metadata ordering, object-URL replacement, and cleanup. It is not packing footage.

## License

The programmatic fixture, provenance JSON, generated WebM, and committed screenshots are project-authored assets distributed under the repository's MIT License. See [ASSET_LICENSE.md](../ASSET_LICENSE.md).

Third-party packages retain their own licenses. `package-lock.json` pins the dependency graph; package metadata is inventory evidence, not a legal compatibility opinion.
