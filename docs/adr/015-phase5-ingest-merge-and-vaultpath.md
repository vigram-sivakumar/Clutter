# ADR-015: Phase 5 — Ingest Merge, Gate Relocation, VaultPath Extraction

**Status:** Accepted

## Context

Phase 5 shipped target-doc items 16-17 (the Ingest folder merge, the `VaultPath` extraction) plus one item bundled in during planning (relocating the Persistence Gate and `MoveService` to their target-specified folder). As with every prior phase, re-grounding the plan in the current repository — rather than reusing the original migration plan's assumptions — surfaced real divergences, plus one genuine self-contradiction inside `architecture-target.md` itself, not just between the docs and the code. This ADR records all of it, following `implementation-rules.md`'s divergence process.

## Decisions

### 1. `ScannedPageFactory` doesn't exist — item 16 proceeded without it

Item 16 calls for "collapsing `ScannedPageFactory`'s redundant wrapping" as part of the Ingest merge. `find . -iname "*ScannedPageFactory*"` returns nothing on this branch — same pattern ADR-011/012/013 already found for `ResourceCreation`, `ResourceDeletionService`, and others: the target doc was written against a sibling branch's state in places. The merge (`discover/`+`understand/`+`build/` → `vault/ingest/{extractors/, identity/, analysis/, frontmatter/}`, one merged `index.ts` barrel) proceeded as a pure `git mv` relocation, no logic changes, without that sub-task.

**Disposition:** permanent, no further action.

### 2. Item 17's named scattered locations were wrong

Item 17 says path-string logic is scattered across "`MoveService`, `PagePathResolver`, `IdentityResolver`." Direct inspection during planning found `PagePathResolver` only *composes* paths (`` `${folderPath}/${name}.md` `` — never splits or parses), and `IdentityResolver` performs no path-string logic at all (it uses a whole path as a fallback identity string). Neither belongs on the list.

The actual set, found by grepping the whole tree for `.split('/')`/`.lastIndexOf('/')`/prefix-checks: `MoveService` (×2), `PagePersistenceCoordinator`, `VaultSyncService`, `Vault.moveFolder`'s descendant-folder prefix check, `ArchiveMetadataReconciler`, `VaultBuilder`, `PageBuilder`, and `DailyNoteService` (×2) — the last one added by Phase 4, after target-doc's Phase 5 text was written, directly confirming Phase 4 changed Phase 5's real scope. All 8 sites (7 files) were migrated to the new `VaultPath` helper.

**Disposition:** permanent. `VaultPath`'s regression signature (`ARCHITECTURE_RULES.md` rule 10) is now mechanically absent from the codebase outside `vault/ingest/VaultPath.ts` and `platform/`.

### 3. `VaultPath` is a pure value object, placed inside `vault/ingest/`, resolving a self-contradiction in `architecture-target.md`

`architecture-target.md` §11 is titled "Storage Extensibility Seam (cross-cutting, **not a folder** — a rule)" and its prose says path logic "goes through one small `VaultPath` helper in Vault Ingest." But the same document's Folder Organization diagram listed `vault/path/` as an independent top-level folder, a sibling of `ingest/` — directly contradicting §11's own heading. This wasn't a code-vs-doc gap like every other finding in this migration; it was the target document disagreeing with itself.

Resolved per explicit direction: `VaultPath` is a file, `vault/ingest/VaultPath.ts`, not a new folder — matching §11's prose. The Folder Organization diagram is corrected in this same commit to remove the contradictory `path/` row. This also settles a dependency question for free: `Vault` (domain model, `vault/model/`) importing `VaultPath` needs no new entry in the dependency diagram, since spec §3 already allows `Vault` to depend on Vault Ingest.

`VaultPath`'s API is deliberately narrow, per explicit direction: `filename`, `parentDirectory`, `isDescendantOf` — plain strings in, plain strings/booleans out. It knows nothing about the filesystem, `Vault`, ids, `Page`/`Folder`, metadata, persistence, or any business rule. `PageBuilder`'s `.md`-extension-stripping (a page-naming concept, not path semantics) stays local to `PageBuilder`, composed with `VaultPath.filename()` rather than absorbed into it — the boundary held even where combining them would have shaved a line.

**Disposition:** permanent. `ARCHITECTURE_RULES.md` rule 10 and target-doc's Architectural Invariant 4 are corrected in this same commit ("`vault/path/`" → "`vault/ingest/VaultPath.ts`" throughout).

### 4. Gate and `MoveService` relocated to `vault/persistence/` — a gap Phase 5's own item list never named

`PagePersistenceCoordinator` and `MoveService` lived at `core/application/persistence/` and `core/application/move/`, though spec §5's own subsystem header and the target's folder-org diagram both place them at `vault/persistence/`. This was flagged during Phase 3 planning as "deferred to Phase 5, as already established" — but neither item 16 nor item 17's literal text ever actually commits to it. Bundled into Phase 5 per explicit direction, since this phase already has eyes on folder structure: mechanical `git mv`, no logic changes. Two empty, untracked leftover directories (`core/application/resources/`, `core/application/notes/`) were deleted in the same commit — unrelated debris the directory work already had visibility into.

**Disposition:** permanent. `core/application/` now contains only genuine application-layer facades.

### 5. ESLint boundary rule deferred, not built

Item 17 also calls for adding "the ESLint boundary rule from Invariant 4." None of `ARCHITECTURE_RULES.md` rules 2, 3, 6, 7, or 10 have any lint enforcement built anywhere in this migration — every one of their "How it is enforced" sections still describes it as aspirational. Building rule 10's lint rule in isolation, while the other four stay code-review-only, seemed like narrow, oddly-scoped infrastructure rather than the coherent piece of tooling the project's stated intent ("this project has used ESLint architectural-boundary enforcement before... and should again") describes.

**Disposition:** deferred, no phase assigned. A future phase building the general architectural-boundary ESLint config should cover all five rules together, not just this one.

### 6. `.folder.md`: read-complete, write-incomplete — evaluated for Phase 5, deliberately not built here

Before implementing Phase 5, we evaluated whether the previously-decided-but-unscheduled `.folder.md` folder-metadata feature should change any Phase 5 decision. It doesn't, but its current state is worth recording precisely so a future contributor doesn't have to re-discover it:

- **Read side — complete.** `VaultScanner` (now `vault/ingest/VaultScanner.ts`) already detects a sibling `.folder.md` entry during directory scanning and reads its frontmatter. `VaultBuilder` already maps that frontmatter onto `Folder.metadata` (icon/favorite/description/cover/status/etc.) via `FolderFrontmatter`. A folder with a `.folder.md` file today already gets real metadata, no further work needed.
- **Write side — does not exist.** The Persistence Gate's `PersistenceOperation` union is entirely page-scoped (`save`/`create`/`archive`/`restore`/`delete`/`move`, all keyed by `pageId`); `FolderOperations` has only `open()`. There is no in-app mechanism to create or update a `.folder.md` file — one can only exist if placed on disk externally, which the scanner will then read.
- **Root metadata — has no home.** `VaultBuilder`'s own comment states the vault root "is not a navigable `Folder` in the domain model," so there is no `Folder` object for a future root-level metadata file to attach to yet.

No Phase 5 decision needed adjustment for this. The reason is structural, not coincidental: `vault/ingest/` already owns scanning/parsing conventions (including any future metadata-file convention), `vault/persistence/` (this phase's own Commit 2) already owns writes for pages *and* folders per spec §5's own scope ("the only mechanism that writes a page/folder to disk"), and `VaultPath` (this phase's own Commit 3) already owns the pure path-semantics a sibling-metadata-file-path computation would need. A one-line doc comment was added to `VaultPath.ts` marking it as the future home for that computation — no method, no code, since an unconsumed method would be exactly the "unconsumed machinery" ADR-011 already rejected for the same reason.

**Recommendation:** the write side, plus root-metadata support, is real, unscheduled feature work — a new Gate operation kind, a `FolderOperations` write method, a decision about where root-level metadata lives given the domain model's current `Folder` shape, a progressive-adoption story for vaults with no `.folder.md` files anywhere, and likely UI. This belongs in its own dedicated future phase, not folded into Phase 5 or Phase 6.

## Why These Are Preferred

Decisions 1-2 and 4-5 follow the same re-grounding pattern every prior phase's ADR has recorded. Decision 3 is the first case in this migration where the frozen target document contradicted itself, not just the code — resolved narrowly, in the direction its own prose already pointed, with the diagram corrected to match rather than left standing as a second, wrong answer. Decision 6 answers a forward-looking question honestly (nothing needs to change now) without using that answer as license to start building the future feature early.
