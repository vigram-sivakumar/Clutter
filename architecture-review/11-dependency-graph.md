# 11 — Dependency Graph

Scope: full fan-out of the core shared objects (`Vault`, `PageOperations`, `FolderOperations`, `Workspace`, `VaultQuery`, `NavigationRouter`) plus navigation-adjacent concepts named in scope (Breadcrumbs, Reserved Paths/Folders, Icons-as-data, Display Names, Metadata, Utilities, Resolvers, Contexts, Hooks).

## Summary

The whole app is wired by **prop-drilling from a single root object, not React Context.** `AppShell` constructs one `Application` instance and passes it (or one of its members) down through exactly two levels (`AppLayout` → `Sidebar`/`PageHost` → feature components) as a plain prop. There is **no `NavigationContext`** anywhere in the codebase — the task brief's assumption that one exists is not borne out by the source; this is itself a finding worth naming explicitly. Ownership of navigation-adjacent concerns (reserved folders, icons, display names, breadcrumbs) is centralized and largely correct — each concept has exactly one definition site — but two of the six subsystems audited for fan-out (`Vault`, `Workspace`) are consumed unusually widely relative to how narrow their actual per-consumer need is, which is a coupling-breadth signal worth flagging even though it isn't a rule violation.

## Current Architecture — Wiring Path

```
AppShell (app/AppShell.tsx)
  → Application.bootstrap(vaultPath) + application.open()   [useState<Application>]
  → <AppLayout application={application} />
       → useVault(application.vault)   [subscribes once, re-renders on any Vault change]
       → <Sidebar application={application} />
       → <PageHost application={application} />
            → feature components receive individual facades (PageOperations,
              FolderOperations, NavigationRouter, VaultQuery, Workspace) as
              typed props, extracted from `application` by each layout/host
              component — never the whole Application object passed further
              than PageHost/Sidebar's own immediate children.
```
Confirmed no `React.createContext`/`useContext` exists for any of `Vault`/`Workspace`/`PageOperations`/`FolderOperations`/`NavigationRouter`/`VaultQuery` (`grep -rl "useContext\|createContext"` across the whole `src/` tree returns only `components/menu/Menu.context.tsx` and `components/tabs/Tabs.tsx` — both unrelated UI-primitive contexts, not domain data). Every domain object reaches a feature component via an explicit prop chain, matching spec §12's contract ("receive typed facade references from `PageHost`/composition") almost exactly, just via props rather than the context alternative the spec's wording leaves open ("props/context").

## Fan-out — Evidence

**`Vault`** (type or value import outside `core/vault/`, non-test): 5 files —
`app/hooks/useActivePage.ts`, `app/hooks/useVault.ts`, `app/layouts/page/topbar/buildTopBarActions.tsx`, `core/presentation/buildBreadcrumbs.ts`, `features/daily-notes/helpers/getActiveDailyNoteDate.ts`.
Narrow fan-out, all read-only consumers (query methods only) — consistent with rule 3.

**`PageOperations`**: 3 non-test consumers — `features/daily-notes/helpers/getActiveDailyNoteDate.ts`, `features/notes/shortcuts/buildNotesShortcutHandler.ts`, `features/notes/sidebar/Sidebar.Notes.tsx`. All `import type`.

**`FolderOperations`**: 1 non-test consumer — `features/notes/sidebar/Sidebar.Notes.tsx`. Narrowest fan-out of all six — consistent with folders being a smaller surface than pages in the current product.

**`Workspace`**: 7 non-test consumers — `app/hooks/useWorkspace.ts`, `features/collection/page/toCollectionPageModel.ts`, `features/daily-notes/sidebar/DailyNotesList.tsx`, `features/daily-notes/sidebar/Sidebar.DailyNotes.tsx`, `features/notes/sidebar/FavoriteList.tsx`, `features/notes/sidebar/FolderTree.tsx`, `features/notes/sidebar/Sidebar.Notes.tsx`. **Widest fan-out of the six objects audited** — `Workspace` (active page/folder, open pages, expanded folders) is read directly by almost every sidebar-adjacent component, which is architecturally sound (it is the one designated owner of navigation UI state, per spec §10) but means a `Workspace` API change has the broadest blast radius of any object in this graph.

**`VaultQuery`**: 7 non-test consumers, largely overlapping with `Workspace`'s consumer set — `core/application/Application.ts` (construction site), `features/collection/page/toCollectionPageModel.ts`, `features/daily-notes/sidebar/DailyNotesList.tsx`, `features/daily-notes/sidebar/Sidebar.DailyNotes.tsx`, `features/notes/helpers/getFavoriteItems.ts`, `features/notes/sidebar/FolderTree.tsx`, `features/notes/sidebar/Sidebar.Notes.tsx`. Every one of these receives the single `Application`-constructed `VaultQuery` instance as a prop/parameter — **no second `new VaultQuery(...)` construction site exists outside `Application.ts` and test files** (already confirmed in report 09's rule-6 audit), so this wide fan-out is fan-out of *usage*, not of *construction* — the correct shape.

**`NavigationRouter`**: 6 non-test consumers, one per top-level feature area — `features/notes/{shortcuts,sidebar}`, `features/tags/{shortcuts,sidebar}`, `features/tasks/{shortcuts,sidebar}`. Clean 1:1 pattern: every feature area has exactly one shortcut-handler file and one sidebar file that reach `NavigationRouter`, each via `import type`.

## Navigation-Adjacent Concepts — Ownership Map

| Concept | Owning file | Consumers | Notes |
|---|---|---|---|
| Reserved folder identity/paths | `core/vault/initialize/ReservedResources.ts` (`RESERVED_RESOURCES`, `RESERVED_FOLDER_IDS`, `reservedFolderRelativePath`, `RESERVED_FOLDER_NAMES`) | `Vault.getReservedFolder`/`isReservedFolder` (`Vault.ts:138,148-154`), `VaultQuery.getVisibleRootFolders` (`VaultQuery.ts:92-96`), `NavigationRouter.openReservedFolder` (`NavigationRouter.ts:54-62`), `VaultInitializer` | Single, correct owner — every consumer reads from this one file's exported constants rather than hardcoding folder names, matching its own doc comment's stated intent ("do not hardcode folder names or paths in navigation or application code"). |
| Icons-as-data | `core/presentation/getPageIcon.ts` | `buildBreadcrumbs.ts` (`getEntryIcon`/`ancestorBreadcrumbs`), presumably page headers/sidebars (not individually traced this pass) | Single source of truth by design (doc comment states this explicitly); a `switch` over `PageType | 'folder' | 'tag'` returning a `SystemIcon` token — data-driven, not JSX-driven, so it's genuinely reusable without React coupling. |
| Display names / placeholders | `core/presentation/getPageDisplayLabel.ts`, `core/presentation/PageDisplayPlaceholders.ts`, `core/presentation/isNoteUntitled.ts`, `core/presentation/getPrimaryDisplayText.ts` | `buildBreadcrumbs.ts`, presumably page headers | A small, cohesive `presentation/` module — good separation: none of these files import `Vault` mutation methods or touch persistence; they are pure functions over `Page`/`Folder`/`PageType` values. |
| Breadcrumbs | `core/presentation/buildBreadcrumbs.ts` (`buildBreadcrumbs`, `buildBreadcrumbsForDraft`) | Presumably `app/layouts/page/` (not individually traced this pass — flagged for the navigation/UX investigator) | Correctly built by walking `Folder.parentId` chains via `vault.getFolder(current)` (`buildBreadcrumbs.ts:48-64`) rather than string-splitting a path — this is the *correct* pattern report 09 found violated elsewhere (Rule 10): breadcrumb construction uses the id/parentId graph, not path strings, so it does not contribute to the Rule 10 violation. |
| Reserved-folder-derived paths for Daily Notes | `core/application/daily-notes/DailyNotePath.ts` (pure) + `core/application/daily-notes/DailyNoteService.ts` (impure, folder materialization) | `Application.open()` (`Application.ts:250`), `PageOperations.persistDraft` (`PageOperations.ts:749-756`), `features/daily-notes/sidebar/DailyNotesList.tsx` | **Two owners, correctly split by responsibility** (`DailyNotePath` = format only, `DailyNoteService` = filesystem-materialization decision) but **both perform path-string manipulation outside `VaultPath`**, which report 09 flags as the Rule 10 violation. From a pure dependency-graph standpoint, this is also the one place a `core/application/` file is imported *by value* into `features/` (`DailyNotesList.tsx:2`) rather than by type — see report 09's Rule 6 note. |
| Contexts | — none for domain data — | — | Explicitly absent; navigation/vault/workspace state is prop-drilled, not context-provided. Not a violation of anything in the spec (§12 allows "props/context" interchangeably) but worth naming since the task brief presumed a `NavigationContext` exists. |
| Hooks | `app/hooks/{useVault,useWorkspace,useActivePage,useDocumentSession}.ts` | `AppLayout` (`useVault`), individual feature/page components (others) | Each hook is a thin `useState`+`useEffect`+`.subscribe()` adapter over exactly one domain object's own subscribe method (`Vault.subscribe`, `Workspace.subscribe`) — no hook constructs a domain object itself (all take one as a parameter), consistent with Rule 6. |
| Resolvers | `core/application/page/PagePathResolver.ts`, `core/application/folder/FolderPathResolver.ts`, `core/vault/knowledge/LinkResolver.ts` | `PageOperations`/`FolderOperations` (path resolvers), `KnowledgeGraphBuilder` (link resolver) | Despite the name, `PagePathResolver`/`FolderPathResolver` were **not** independently re-verified this pass for Rule-10 compliance — flagged as a follow-up (see Next Investigation Areas); `VaultPath`'s own spec doc explicitly clears `IdentityResolver`/`PagePathResolver` of doing path-string parsing (ADR-015, cited in `VaultPath.ts`'s own header comment), so this is likely compliant but should be confirmed directly rather than taken purely on the comment's word. |
| Utilities / naming | `core/shared/naming/{AutoGeneratedPageName,resolveCollisionFreeName}.ts`, `core/shared/identity/{IdGenerator,UuidGenerator}.ts` | `PageCreator`, `FolderCreator`, `PagePathResolver` (presumed, not individually traced) | Correctly placed under `core/shared/`, a layer below both `vault/` and `application/` in the dependency graph — no upward-import risk found. |

## Evidence — Layering Violations Checked

Targeted greps (report 09) found **zero** upward imports: no `core/vault/`→`core/application/`, no `core/engine/`→`core/application/`, no `core/`→`features/`, no `core/vault/`→`core/workspace/`. Combined with the fan-out data above, the dependency graph is a clean DAG matching Platform → Ingest → Domain/Persistence/Sync → Application → UI, with `Workspace` correctly parallel (depended on by Application and UI, depending on nothing — confirmed no imports found inside `core/workspace/Workspace.ts` beyond its own file in this pass).

## Strengths

- Genuinely a DAG — no upward imports found anywhere in this investigation's grep sweep.
- Reserved-folder identity has exactly one definition site, and every consumer reads through it rather than re-declaring folder name strings — the "single source of truth" comments in `ReservedResources.ts` and `getPageIcon.ts` are actually true on inspection, not just aspirational.
- `VaultQuery`'s wide *usage* fan-out is matched by a narrow *construction* fan-out (one instance, one constructor call site) — exactly the shape Rule 6 wants.

## Weaknesses

- `Workspace` and `VaultQuery` both have the widest consumer fan-out (7 files each) with almost fully overlapping consumer sets (`DailyNotesList.tsx`, `Sidebar.DailyNotes.tsx`, `Sidebar.Notes.tsx`, `FolderTree.tsx` all import both) — any future change to either object's shape has a correlated, not independent, blast radius across the sidebar feature area.
- `DailyNoteService`/`DailyNotePath` sit in an awkward spot in the graph: nominally "application layer," but their only real content is path-string logic that Rule 10 says belongs one layer down (`VaultPath`). Their current location is a layering *smell* even though no import-direction rule is technically broken by it (they still only import from `vault/models`/`vault/initialize`, never upward).

## Hidden Assumptions

- The task brief's premise that a `NavigationContext` exists — it does not. Any future investigator building on this report's premises should not assume React Context is in play anywhere in the domain-data path.
- That "one `Application` instance, passed as a single prop" scales fine as feature count grows — true today (2-hop prop chain: AppShell→AppLayout→feature), but every new feature area that needs a facade must be threaded through `Sidebar`/`PageHost` explicitly; there's no mechanism (context or otherwise) letting a deeply-nested new component reach `PageOperations` without every intermediate component in its render path also accepting and forwarding the prop.

## Hidden Coupling

- `DailyNotesList.tsx` importing `DailyNotePath` by value (not type) is a `features/` file with a compile-time dependency on an `application/`-layer concrete class, not just its type shape — see report 09.
- `Sidebar.Notes.tsx` is the single file with fan-out to **four** of the six audited objects (`Workspace`, `VaultQuery`, `PageOperations`, `FolderOperations`, plus `NavigationRouter` — five, actually) — it is the de facto "kitchen sink" component of the sidebar feature area and the single highest-risk file for accidental architecture-boundary violations in future edits, purely by virtue of already legitimately depending on almost everything.

## Behavior Analysis

`useVault`/`useWorkspace` both use the identical `useState(0) + subscribe + setVersion increment` re-render pattern (`useVault.ts`, `useWorkspace.ts`) — a deliberate, consistent convention for bridging a plain-JS `subscribe()`-based object into React's render cycle, applied uniformly rather than each hook inventing its own variant.

## UX Analysis

Not directly in this report's scope — flagged for the UX/navigation investigators: since there is no context, any UI element that needs `PageOperations`/`NavigationRouter` etc. and isn't already a descendant of `Sidebar`/`PageHost` (e.g. a future command palette, a future modal rendered via a portal outside the normal tree) will need either prop-threading through an unnatural path or a new wiring mechanism — worth checking whether any such component already exists and how it currently gets its facades.

## Product Analysis

The consumer-count data suggests the product's actual feature surface today is concentrated in four areas — Notes, Tags, Tasks, Daily Notes (each with its own `shortcuts/`+`sidebar/` pair reaching `NavigationRouter`) — a clean, small, legible product shape that matches the "single vault, single set of first-class content types" framing likely covered in the product report (10).

## Performance Analysis

Not a primary concern for this report — see report 07 for the `VaultQuery`/`Vault` performance analysis this fan-out ultimately feeds into. Worth noting: because `useVault`'s subscription re-renders on **any** vault change (not scoped to what a given component actually reads), and it's called once at `AppLayout`'s level wrapping the *entire* Sidebar+PageHost tree, **every vault mutation anywhere re-renders the whole application shell**, not just the affected leaf. React's own reconciliation limits the practical cost of this (no DOM work for unchanged subtrees), but it does mean there is no fine-grained subscription model (e.g. per-folder or per-page subscriptions) — consistent with, and compounding, report 07's finding that `VaultQuery` itself has no memoization.

## Scalability Analysis

The wiring pattern itself (prop-drilling through 2-3 levels) scales fine with vault size — it's independent of page/folder count. It does not scale as cleanly with *feature count*: each new top-level feature area repeats the same shortcuts/sidebar-file pattern and its own explicit prop wiring; nothing here is a scalability risk at the current feature count (4 areas) but would become mildly repetitive tooling-wise well before it became an architecture problem.

## Alternative Designs

- A thin `AppFacades` context (holding the same `Application` reference already passed as a prop) would remove the need to thread facades through every intermediate component, at the cost of making the wiring path less explicit/greppable than today's prop chain — a real trade-off, not a strict improvement, given the spec's own preference for explicitness (§12's testing strategy: "mock facades... never a real Application instance in a UI unit test" — a prop-based design keeps this trivial; context makes it slightly more indirect but not meaningfully harder).
- Scoped/selector-based subscriptions (e.g. `useVault(vault, selector)` re-rendering only when a specific slice changes) would address the performance note above without requiring context.

## Trade-offs

Prop-drilling over context here is a legitimate, working choice for the current app size (2-3 component levels deep) — it keeps every dependency explicit and greppable, which is exactly what let this investigation trace the whole fan-out graph confidently via `grep`. It will start to hurt specifically when a feature needs a facade from a render position that isn't already inside `Sidebar`/`PageHost`'s existing prop path — not before.

## Confidence Level

- Fan-out counts and file lists: **Verified** (direct grep, cross-checked against test-file exclusion).
- No `NavigationContext`/domain-data context exists: **Verified** (`createContext`/`useContext` grep across entire `src/` tree).
- Zero upward-layering imports: **Verified** for the specific pairs checked (vault→application, engine→application, core→features, vault→workspace); **not exhaustively checked** for every possible pairwise combination (e.g. `application`→`engine` reverse direction not explicitly re-verified beyond spec's own stated dependency, `presentation/`→other layers not checked).
- `PagePathResolver`/`FolderPathResolver` Rule-10 compliance: **Likely**, based on the spec's own ADR-015 claim, not independently re-derived from source in this pass — flagged for follow-up.
- Breadcrumb consumer location (which component renders `buildBreadcrumbs`' output): **Unknown** — not traced this pass.

## Next Investigation Areas

- Directly re-verify `PagePathResolver.ts`/`FolderPathResolver.ts` for path-string operations (extend report 09's Rule 10 evidence) rather than relying on `VaultPath.ts`'s own comment citing ADR-015.
- Trace which component(s) actually render `buildBreadcrumbs`'s output, for the navigation/UX report.
- Confirm with the UX/navigation investigator whether any component outside the `Sidebar`/`PageHost` subtree needs a facade today (command palette, modals, etc.), and if so how it currently obtains one.
