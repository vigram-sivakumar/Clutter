# ADR-016: Phase 6 — Cleanup, and Closing the Six-Phase Migration Plan

**Status:** Accepted

## Context

Phase 6 shipped target-doc items 18-21. Items 18 and 19 were confirmed accurate and executed exactly as described. Items 20 and 21 needed correction and, for 21, a split disposition — recorded here per `implementation-rules.md`'s divergence process, the same pattern every phase in this migration has followed.

## Decisions

### 1. Items 18-19: confirmed accurate, no divergence

`packages/engine`/`packages/editor` (5,025 LOC) and the 7 confirmed dead files were re-verified directly before deletion — still zero real consumers each, still outside the npm workspace for the packages. Deleted exactly as described. One piece of direct fallout not named in either item: `IconSlot.css`, orphaned by `IconSlot.tsx`'s deletion, removed in the same commit once confirmed to have no other consumer.

**Disposition:** permanent, no further action.

### 2. Item 20: "alias" was never a real target; `knowledgeGraph` needed a shape fix, not just a timing change

Confirmed via direct inspection: there is no vault-wide alias projection anywhere in the codebase to make lazy. `Alias` is plain per-page data (`Page.aliases`), never aggregated into a `Vault`-level index or getter — ADR-004 already said this more precisely than target-doc's item 20 summary ("alias extraction... is not surfaced as a public `Vault` API until something consumes it"). The real, and only, target was `knowledgeGraph`/`embeds`.

Making them lazy required more than the "pure performance change" item 20 describes:
- `Vault.knowledgeGraph` was a property getter (`get knowledgeGraph()`); spec §3 specifies a method (`knowledgeGraph(): KnowledgeGraph`). Fixed as part of this commit — a real, disclosed signature change, though one with zero production callers to break.
- `VaultProjectionBuilder.build()` computed all four projections (tags, tasks, embeds, knowledgeGraph) in one combined call. Split into `buildEager()` (tags/tasks, called on every mutation) and `buildLazy()` (embeds/knowledgeGraph, invalidated on mutation, rebuilt only on next access) — necessary, not optional: a combined call would have computed embeds/graph on every eager rebuild regardless, defeating the point.
- A second, unrelated `VaultPath`-extraction miss from Phase 5 was found and fixed in passing while working in the same file: `isReservedTopLevelFolderPath` computed a `` `${vaultRoot}/` `` prefix into a variable before calling `.startsWith()` on it, which Phase 5's audit grep (matching only inline-backtick `.startsWith(\`...\`)` calls) didn't catch. Rewritten using `VaultPath.parentDirectory`/`.filename`.

**Disposition:** permanent. Referential-stability and invalidate/rebuild-on-access behavior covered by 5 new tests, including a spy-based test proving `buildLazy()` is never called by a mutation itself and rebuilds at most once across several stacked mutations.

### 3. Item 21 splits: `References` deferred as a real feature, not dead code; `Controls` left open

**`References`:** `Page.tsx` rendered `<References>` with no `references` prop and no real data source anywhere — permanently empty regardless of user action, the literal "fake wiring that always produces an empty result" this item targets. That render call and its supporting `referencesExpanded` state were removed.

`Reference.tsx`/`Reference.css` were **kept**, not deleted, per explicit direction: the component itself is architecturally clean — pure presentation, typed props, no `Vault`/filesystem/business-logic coupling — and removing the fake wiring leaves it with zero render sites anywhere, i.e. fully unreachable. Rather than either leaving fake wiring in place or deleting a component with no real maintenance cost, it's kept as a deliberately deferred product feature. **This is not dead code** — dead code is unreachable and unintended; this is unreachable and intended, pending a specific, named piece of future work:

1. Build the backlink/reference indexing subsystem (a real projection, following `Vault`'s existing lazy-projection pattern from Decision 2 above).
2. Expose it through `VaultQuery` (the read layer) — not a new query mechanism, the existing one.
3. Wire `Reference.tsx` to that real query API from `Page.tsx`.
4. Keep all parsing, indexing, and business logic outside the UI component — `Reference.tsx` stays exactly as presentation-only as it is today.

**`Controls`:** initially deleted (its 3 inert controls — two permanently-`disabled` history buttons with no navigation-history state anywhere, and a sidebar-toggle button with no handler at all) in the same pass as `References`, then explicitly restored per your follow-up direction: it will be wired later rather than removed now. `Controls.tsx` is unchanged from its pre-Phase-6 state.

**Disposition:** `References` — permanent removal of the fake wiring, component kept, tracked as a named future feature (not a phase — no phase assigned, same status as several other post-Phase-2 findings). `Controls` — untouched, open, no disposition change from before this phase; it remains 3 inert controls, unresolved.

## Closing the Six-Phase Migration Plan

Items 18-20 are fully closed. Item 21 is half-closed (`References`) and half-open (`Controls`) by explicit choice, not oversight. That means Phase 6 — and with it, `architecture-target.md`'s originally-numbered six-phase migration plan — is **substantially, not entirely, complete**. This is worth stating plainly rather than rounding up: `Controls`'s 3 inert controls are the one piece of the original six-phase plan's scope that remains genuinely open.

What's left, beyond `Controls`, is the backlog every prior phase's ADR has been accumulating — none of it was ever in the six-phase plan's scope, and none of it gets pulled in now:
- The `core/engine` → `application/editing/` rename, and `VaultSyncService`'s `DocumentRegistry` dependency it's tied to (ADR-012).
- `PageOperations.rename()` — no Gate operation shape exists yet (ADR-011/012).
- `createTask`/`createTag` — blocked on `TaskOperations`/`TagOperations` existing (ADR-013's referenced ADR-012 disposition).
- Move's destination-picker UI (ADR-013).
- The `Workspace` "active view" state extension the 6 deleted view-intent stubs would need to come back (ADR-014).
- `.folder.md`'s write side and root-metadata support (ADR-015).
- The 5 ESLint architectural-boundary rules — none built anywhere in this migration (ADR-015).
- `Controls`'s 3 inert controls (this ADR).
- The backlink/reference indexing subsystem `References` needs (this ADR).

## Why These Are Preferred

Decision 2 follows the same re-grounding pattern every phase's ADR has recorded — verify the target text against the actual code before implementing it. Decision 3 is the first case in this migration where "wire or delete" resolved to neither cleanly: a real architectural distinction (fake wiring vs. a clean, reusable, currently-unreachable component) made "keep the component, remove only the fake part" the correct answer, not a compromise between the two options originally offered.
