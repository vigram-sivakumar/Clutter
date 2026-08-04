# 00 — Overview

Entry point for the Clutter architecture review. Read this first; it points into the deeper reports (01-15) for detail.

## What Clutter Is

Clutter is a Tauri + React desktop note-taking app ("Core editor implementation with segmented architecture" per `apps/app/package.json`) built around a plain-Markdown vault on the local filesystem — one folder tree, `.md` files with YAML-ish frontmatter, no proprietary database. Product surfaces found in this investigation: Notes (folders + pages), Daily Notes (one note per calendar date, auto-organized into `Daily Notes/YYYY/Month/`), Tags, Tasks (checkbox syntax extracted from Markdown), Archive/Inbox/Templates as reserved system folders, and a knowledge-graph/embeds/aliases layer that is modeled and indexed but has **no shipped UI consumer yet** (confirmed in reports 07/09 — deliberately allowed under Rule 8, "derived data is disposable"). Today it opens exactly one hardcoded vault path (`app/AppShell.tsx:10` — `// TODO: Replace with the folder picker`); there is no multi-vault or vault-switching UI yet.

## Architecture at a Glance

Clutter's architecture is frozen and documented in unusual depth for a project this size: a full specification (`docs/architecture-specification.md`), 12 named, individually-enforced rules (`ARCHITECTURE_RULES.md`), a durability vocabulary (`docs/durability-model.md`), and 19 ADRs recording *why* each major decision was made (`docs/adr/`). This is itself worth naming as a defining trait of the codebase: the documentation is not aspirational boilerplate — every rule and spec section audited in this review (07/09/11) was checked directly against source and found either genuinely enforced or, where violated, violated in a way the documentation itself had already anticipated by name (see Rule 10 below).

**Module map** (`apps/app/src/`):

| Folder | One-line responsibility |
|---|---|
| `core/vault/providers/` | Platform: the only code touching Tauri fs/watcher APIs directly (spec calls this "platform/" — actual location is nested under `vault/`, a naming/location mismatch worth fixing, not a behavior bug). |
| `core/vault/ingest/` | Pure transformation: raw Markdown+frontmatter → typed `Page`/`Folder` objects (scanner, builders, parser/serializer, identity resolution, extractors, `VaultPath`). |
| `core/vault/models/` | The domain shape (`Page`, `Folder`, metadata, occurrences, knowledge graph) and the `Vault` class — the sole in-memory source of truth. |
| `core/vault/knowledge/` | Derived projections (tags, tasks, embeds, knowledge graph) built from `Vault`'s pages, always disposable/rebuildable. |
| `core/vault/queries/` | `VaultQuery` — read-only filtered views over `Vault` (root/child folders and pages, favorites, archive). |
| `core/vault/persistence/` | The Persistence Gate (`PagePersistenceCoordinator`) — the one and only app-initiated write path to disk + `Vault`. |
| `core/vault/sync/` | Reconciles external (non-app) filesystem changes back into `Vault`, serialized per-path. |
| `core/application/` | The capability facades — `PageOperations`, `FolderOperations`, `NavigationRouter`, `Application` (Composition Root) — the one place UI-facing business rules live. |
| `core/engine/` | `DocumentEditing` — live edit buffer, revision tracking, autosave save-lifecycle state for open pages. |
| `core/workspace/` | Transient navigation UI state (active page/folder, open pages, expanded folders) — parallel to the vault stack, depends on nothing. |
| `core/presentation/` | Pure display-formatting helpers (breadcrumbs, display labels/placeholders, icon-as-data lookups) — no I/O, no state. |
| `core/shared/` | Cross-cutting utilities (id generation, name collision resolution) below both `vault/` and `application/` in the dependency graph. |
| `app/` | The React shell — `AppShell` (bootstraps `Application`, owns the one vault-open lifecycle), hooks bridging domain `subscribe()` objects into React state, top-level layouts. |
| `features/` | Product surfaces (Notes, Daily Notes, Tags, Tasks, Search, Collection, Markdown editor) — each receives typed facade props, never constructs application-layer classes itself. |
| `components/`, `design-system/` | Shared UI primitives and design tokens — see reports 02-06 for depth. |

## The 3-5 Things a New Contributor Must Understand First

1. **There is exactly one write path, and it's a promise-chain queue keyed by page id.** `PagePersistenceCoordinator.enqueue(pageId, operation)` is the only code in the entire app that calls `fileSystem.writeFile`/`deleteFile`/`moveFile` for page/folder content and the only code that mutates `Vault` for an app-initiated action. This was verified directly (report 09) — every save/create/delete/move/archive/restore in `PageOperations`/`FolderOperations` funnels through it, with zero bypasses found. Understand this queue before touching anything persistence-adjacent.

2. **`Vault` is a single frozen-shape, fully-rebuildable object graph, not a database.** It holds two `Map`s each for pages and folders (by id, by path), plus eager (tags/tasks — rebuilt in full on every mutation) and lazy (knowledge graph/embeds — rebuilt on next access after invalidation) projections. Nothing here is ever patched incrementally; a change means "build a new immutable `Page`/`Folder`, replace it in the maps, `notify()`." This is why "derived data is disposable" (Rule 8) is safe to rely on — see report 07 for the scalability implications of always-full-rebuild at larger vault sizes.

3. **Frontmatter parsing/serialization is hand-rolled, not a YAML library — and it has a confirmed, silent data-loss bug.** Report 07 traced a live round-trip hole: `aliases` frontmatter is read and indexed but never re-serialized on save, so the first app-initiated save of a page with hand-authored `aliases:` silently deletes them. No UI consumer of aliases was found in this pass, so it's currently latent rather than reachable through the product — confirm this before treating it as low-priority (see report 07's Next Investigation Areas).

4. **UI never constructs application/vault-layer objects — everything is passed in as a typed prop from a single `Application` instance built once in `AppShell`.** There is no `NavigationContext` or any other React Context carrying domain data (verified — grep for `createContext`/`useContext` across the whole tree found none related to vault/navigation state); wiring is explicit prop-drilling, 2-3 levels deep, from `AppShell` → `AppLayout` → `Sidebar`/`PageHost` → feature components. See report 11 for the full fan-out map and why this matters for anyone adding a new UI surface that isn't already inside that tree (e.g. a future command palette or modal).

5. **The one confirmed, concrete architecture-rule violation in the codebase is path-string manipulation living outside `VaultPath`** (Rule 10) — and it's not a new mistake: `ARCHITECTURE_RULES.md`'s own rationale for Rule 10 names the exact files (`MoveService`, `VaultSyncService`, `DailyNoteService`, `Vault.moveFolder`) that were *already found* doing this in a prior audit. Some of that list is now clean (`PagePersistenceCoordinator`, `VaultBuilder`, `PageBuilder` no longer do it); `MoveService.ts`, `VaultSyncService.ts`, `DailyNoteService.ts`, and `Vault.ts` (`getReservedFolder`) still do, with file:line evidence in report 09. This is the one place "the rules are enforced" (true almost everywhere else audited) visibly slipped, and it's a useful case study in why the rule itself is marked "code-review checkpoint, not lint-enforced" — that's exactly how it persisted.

## Where the 12 Rules Stand (from report 09)

11 of 12 rules pass with direct evidence (one owning facade, single write path through the Gate, Vault mutation confined to persistence/sync, Platform fs isolation, business rules in facades not infrastructure, UI never constructs services, downward-only dependencies, disposable derived data, facades never bare-forward, single Composition Root, no capability with two write paths). Rule 10 (path semantics confined to `VaultPath`) is violated, as above. `NavigationRouter` has also drifted structurally from the frozen spec — missing 6 of its spec'd view-filter methods, with 2 unspec'd stub methods that throw at runtime instead — worth investigating alongside the product/features reports to see whether that functionality moved elsewhere (e.g. directly into `VaultQuery` consumers) or was never built.

## Pointers Into the Other Reports

- **01 tokens / 02 icons / 03 design-system / 04 components** — not investigated in this pass; `core/presentation/getPageIcon.ts` (icons-as-data) and `design-system/` were only touched tangentially (report 11).
- **05 ux / 06 navigation** — report 11 surfaces several open threads for these investigators: which component renders `buildBreadcrumbs()`'s output, whether any UI element can reach `NavigationRouter.createTask()`/`createTag()` (both throw), and how a hypothetical command-palette/modal outside the `Sidebar`/`PageHost` tree would obtain facades given there's no Context.
- **07 data-model** (this review) — Page/Folder shape, frontmatter format, identity resolution, the aliases data-loss bug, projection/query performance.
- **08 features** — not investigated directly; `features/` fan-out data is in report 11 (Notes/Tags/Tasks/Daily Notes each have a clean shortcuts+sidebar pair reaching `NavigationRouter`).
- **09 application-architecture** (this review) — full 12-rule compliance audit with grep evidence.
- **10 product** — the product-shape observations above (single vault, four content-type feature areas, no vault picker yet) are a starting point, not a full product analysis.
- **11 dependency-graph** (this review) — full fan-out map, ownership table for navigation-adjacent concepts, confirms no Context exists.
- **12 simplification** — candidate targets surfaced by this review: `NavigationRouter`'s two throwing stubs (report 09), the two independent by-path indexes (`Vault.pagesByPath` vs `PageIndex.pagesByPath`, report 07).
- **13 performance / 14 scalability** — reports 07 and 11 both flag the same root cause from different angles: no memoized/indexed queries between `Vault`'s raw iterators and `VaultQuery`'s consumers, and full-vault projection rebuilds on every mutation. Explicitly a "fine at hundreds, un-load-tested at tens of thousands" situation — no perf benchmarks exist in-repo to confirm actual numbers.
- **15 final-recommendations** — this review's standout, ready-to-act findings: (1) fix the aliases round-trip bug (data loss, report 07); (2) extend `VaultPath` with the join/split primitives its own doc comment already anticipates and migrate `MoveService`/`VaultSyncService`/`DailyNoteService`/`Vault.getReservedFolder` onto it (report 09); (3) resolve the `NavigationRouter` spec-vs-code gap — either implement the missing view-filter methods or update the spec to match reality, and delete or implement the two throwing stubs.

## Confidence Level

This overview synthesizes reports 07/09/11, all produced in this session with direct source citations (Verified findings) and a small number of explicitly-labeled Likely/Hypothesis/Unknown items carried forward from those reports. It does not independently verify claims about reports 01-06, 08, 10, 12-15, which are referenced only as pointers for other investigators, per the task's instructions.
