# ADR-009: Delete Orphaned `packages/engine` and `packages/editor` Rather Than Integrate

**Status:** Accepted

## Context

`packages/engine` and `packages/editor` (5,025 LOC across 12 files) implement a complete, well-tested, standalone block-based editor: a pure state/reducer core, a command layer, undo/redo history, a DOM renderer, and a React controller. It is not an npm workspace member (neither package even has its own `package.json`, and the root workspace glob excludes `packages/*`), has zero import sites anywhere under `apps/`, and its one reference in `apps/app/tsconfig.json` points at a path that doesn't exist. Git history shows it was extracted from an earlier editor implementation on 2026-06-30 and superseded less than a month later by a differently-architected system (`core/engine`/`DocumentEditing`, per ADR-010) that shares no vocabulary with it (no `PrimitiveOp`/`applyOp`/`EditorController` concepts anywhere in the live code).

The product may still want a richer, block-based editor eventually — the current `MarkdownEditor.tsx` is explicitly documented as an intentionally minimal first implementation. The question is whether that future editor should be built by integrating `packages/`, or by treating it as fully superseded.

## Decision

Delete `packages/engine` and `packages/editor` entirely. If/when a richer editor is prioritized, it is designed against the *current* `DocumentEditing`/`PageOperations` seam (per ADR-010's extension point — `DocumentTransaction` is already shaped as a discrete, replayable unit for exactly this reason), not resurrected from a design that predates that seam and was abandoned before it was ever connected to it.

## Alternatives Considered

- **Integrate `packages/` now, wiring it in as the app's real editor.** Rejected: this is a significant scope expansion disguised as "just wiring up existing code" — the current app has zero product surface depending on block-editor semantics (`PrimitiveOp`, structured undo/redo, DOM diffing renderer), and integrating it would mean adopting all of that surface area's maintenance cost for a capability the product hasn't committed to shipping. This is precisely the "architecture-first, ahead of product validation" pattern the review identified elsewhere (the knowledge graph) — the fact that this instance is more complete doesn't change the analysis, since completeness of an unintegrated system isn't the same as it being validated against the current application layer.
- **Leave `packages/` in place, untouched, as a reference for a future editor rewrite.** Rejected: dead code with zero test-runner coverage (its own tests aren't picked up by any configured vitest run) rots silently — it will not be kept correct against the rest of the codebase's evolution, so by the time it's needed as a "reference" it will likely need re-validation from scratch anyway, at which point it provides little more value than a design document would, while continuing to cost onboarding confusion (two things named "engine" in the same codebase) and repo size in the meantime.
- **Move `packages/` into `apps/app` as an explicitly unwired `editor-v2/` feature branch, gated behind a flag.** Rejected: this codebase has no feature-flag system today, and introducing one solely to house dead code would be new machinery serving no current purpose — the review's own principle (don't build for an imagined future) applies here as much as it does to the knowledge graph.

## Consequences

- 5,025 LOC and 12 files are removed with zero behavior change to the shipping app (nothing imports them today).
- The `core/engine` vs. `packages/engine` naming collision (a real onboarding hazard the review flagged) disappears entirely rather than needing a rename negotiation.
- A future richer editor is scoped as new work against a known-current seam, rather than as an "integration" whose actual cost (reconciling a year-old abandoned design against the current application layer) would likely exceed a fresh design informed by `DocumentEditing`'s existing `DocumentTransaction` shape.

## Why This Approach Is Preferred

This is not a difficult call once reachability is verified: code with zero consumers, zero workspace membership, and a confirmed successor already live in production is not a partially-integrated asset to finish, it's dead code to remove. Keeping it would cost real onboarding clarity for a hypothetical future benefit that a fresh, seam-aware design would likely deliver better anyway.
