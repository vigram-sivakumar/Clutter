# 04 — Composite Component Audit (Sidebar, Page Chrome, Search)

Scope: `apps/app/src/app/layouts/sidebar/**`, `apps/app/src/app/layouts/page/**`, `apps/app/src/features/search/**`, plus every feature-level sidebar/topbar/shortcuts file that composes into these layouts.

## Summary

The layout layer (`app/layouts/`) is disciplined: every presentational component there (`Section`, `View`, `Navigation`, `Breadcrumbs`, `PageTopBar`, `Page`) takes plain props/render-props and owns no facade references, no domain imports, and no business logic. All facade access, all domain-object handling, and all navigation-intent dispatch live one level up, in `features/*` container components (`Sidebar.Notes.tsx`, `Sidebar.Tags.tsx`, `PageHost.tsx`, etc.) and in the `core/presentation/*` helper modules those containers call. This is the correct shape per Rule 6/7. No component anywhere in the audited tree constructs a concrete application/vault-layer class (`grep` for `new VaultQuery(`, `new PageOperations`, etc. found zero hits outside `*.test.ts(x)` fixtures).

The most important finding is not a boundary violation — it's a **completeness gap disguised as parity**: `Tags` and `Tasks` sidebar panels are visually styled to look like fully interactive lists (`Tag`, `Task` components with hover/click affordances) but are wired to no-op handlers throughout. `SearchPanel` is a literal one-line stub. These are documented, deliberate placeholders (see `docs/adr/016`), not accidental leaks — but they are real UX gaps a user hits immediately upon opening those tabs. This belongs primarily to report 05, but is rooted here in how the components are composed.

## Current Architecture

```
Sidebar.tsx (feature-agnostic tab shell)
 ├─ Controls              — presentational, all buttons hard-disabled
 ├─ Tabs/Tab               — presentational
 ├─ per-tab panel:
 │   ├─ Notes (features/notes/sidebar/Sidebar.Notes.tsx)
 │   │    ├─ View → NotesShortcuts (Section of Navigation rows)
 │   │    ├─ Section "Favorites" → FavoriteList (uses getFavoriteItems(query))
 │   │    └─ Section "Folders" → FolderTree (recursive, query + workspace)
 │   ├─ DailyNotes (features/daily-notes/sidebar/Sidebar.DailyNotes.tsx)
 │   │    ├─ View → DailyNotesShortcuts (Calendar widget + "Start your day" CTA)
 │   │    └─ DailyNotesList (Section per month, DailyNote rows)
 │   ├─ Tasks (features/tasks/sidebar/Sidebar.Tasks.tsx) — vault.tasks() → renderTasksByDate
 │   ├─ Tags (features/tags/sidebar/Sidebar.Tags.tsx) — vault.tags() → renderTags
 │   └─ SearchPanel (features/search/SearchPanel.tsx) — stub
 └─ Footer — one wired button (openArchive)

PageHost.tsx (feature-agnostic page-rendering composition root)
 ├─ resolves workspace.activeFolderId / activePageId
 ├─ folder branch → toCollectionPageModel + buildBreadcrumbs + buildTopBarActions → Page(body=CollectionBody)
 ├─ draft branch (ADR-017) → toDraftPageModel + buildBreadcrumbsForDraft + buildDraftTopBarActions → Page(body=MarkdownBody/MarkdownEditor)
 └─ persisted page branch (note | daily-note only) → toResourcePageModel + buildBreadcrumbs + buildTopBarActions → Page(body=MarkdownBody/MarkdownEditor)
```

`Page`, `PageTopBar`, `Breadcrumbs`, `Section`, `View`, `Navigation` are pure presentational components — verified by reading each file; none imports anything from `core/application`, `core/vault`, or `core/workspace`.

## Evidence

- **No UI-constructed services.** `grep -rn "new VaultQuery\|new PageOperations\|new FolderOperations\|new NavigationRouter\|new Vault(" apps/app/src/app apps/app/src/features apps/app/src/components` returns hits only inside `*.test.ts(x)` files (`features/collection/page/toCollectionPageModel.test.ts:73,83`, `features/daily-notes/shortcuts/DailyNotesShortcuts.test.tsx:57`, `features/daily-notes/sidebar/DailyNotesList.test.tsx:88,102,124,138`). Test fixtures constructing their own `Vault`/`VaultQuery` doubles is expected and outside Rule 6's scope (which governs shipped component code). **Verified.**
- **Facade objects flow as props, not context.** `Sidebar.tsx:24-25` destructures `{ vault, query, navigation, pageOperations, folderOperations }` from the `application` prop and passes the specific facades each child needs as explicit props (`Sidebar.tsx:44-90`). `PageHost.tsx:39` receives the whole `Application` object as a single prop and reads facades off it directly (`application.pageOperations`, `application.folderOperations`, `application.query`) rather than via React context — there is no `ApplicationContext`/`useApplication()` anywhere in the tree (`grep -rn "createContext" apps/app/src/app apps/app/src/features` — not found for Application). This is straightforward prop-drilling of one level (`AppLayout` → `Sidebar`/`PageHost`), not deep drilling, since `Application` is passed as a single cohesive bundle of already-approved facades. **Verified.**
- **Tags/Tasks sidebars receive raw `Vault`, not `VaultQuery`.** `Sidebar.Tags.tsx:9`/`Sidebar.Tasks.tsx:9` type their prop as `vault: Vault` and call `vault.tags()`/`vault.tasks()` directly (`Sidebar.Tags.tsx:14`, `Sidebar.Tasks.tsx:14`), while `Notes`/`DailyNotes` are typed against `query: VaultQuery` (`Sidebar.Notes.tsx:19`, `Sidebar.DailyNotes.tsx:11`) and call `query.getChildFolders`/`getChildPages`/etc. `tags()`/`tasks()` are live-projection getters on `Vault` itself (spec §4/§8, "Derived data is disposable"), so reading them directly is architecturally permitted — `VaultQuery` isn't the only sanctioned read surface — but it is an **inconsistent read-access pattern within the same layer**: two sidebar tabs go through `VaultQuery`, two go through `Vault` directly, for no principled reason visible in the code (no comment explains the choice). **Strong Evidence** this is unprincipled/historical rather than deliberate — no ADR or comment justifies the split.
- **Tags/Tasks panels are non-interactive despite looking interactive.** `Sidebar.Tags.tsx`/`Sidebar.Tasks.tsx` receive no `workspace` prop and no `onOpen` callback at all (compare their prop interfaces at `Sidebar.Tags.tsx:8-11` / `Sidebar.Tasks.tsx:8-11` against `Notes`'s at `Sidebar.Notes.tsx:18-26`). `renderTags.tsx:9` renders every `Tag` with `onClick={() => {}}`; `renderTasksByDate.ts:29` renders every `Task` with `onClick={() => {}}` and passes no `onCheckedChange`, so the `Checkbox` in `Task.tsx:37` is permanently non-functional. `groupTasks.ts:6-13` is an explicit `TODO` stub collapsing every task into one `all` bucket, so the `Section` header groupings implied by the UI (Today/Overdue/Upcoming/Completed per the removed comment at `renderTasksByDate.ts:19-20`) don't actually exist yet. **Verified.**
- **`SearchPanel` is a one-line stub.** `features/search/SearchPanel.tsx:1-3`: `export function SearchPanel() { return <>Work inprogress...</>; }`. No search input, no state, no facade usage at all. **Verified.**
- **`Folder` row's inline action buttons ("+", "…") are unwired.** `features/notes/sidebar/Folder.tsx:53-62` renders two `Button`s (create-child, overflow) with no `onClick` — clicking does nothing, silently, unlike the tags/tasks placeholders which at least have an explicit `onClick={() => {}}` marking the intent. **Verified.**
- **`ResourceTopBarActions` overflow menu has partially-wired items.** `topbar/ResourceTopBarActions.tsx:44-49` renders "favorite" and "width-fill" buttons with no `onClick` at all; inside the overflow menu, `noteTopBarMenu.config.ts` lists `add-a-description`, `duplicate`, `add-to-favorite`, `version-history` alongside `archive/restore/delete` — but `buildTopBarActions.tsx`'s `handlers` map (`ResourceTopBarActionsProps.handlers`) only ever supplies `archive`/`restore`/`delete` (`topBarRegistry.tsx:28-32`), so the other four items render, are clickable, and do nothing but close the menu (`ResourceTopBarActions.tsx:70-73`, `handlers?.[item.id]?.()` is `undefined` for those ids). This is explicitly documented as "exactly as every currently-unwired item already behaves today" (`ResourceTopBarActions.tsx:36-37`), i.e. acknowledged tech debt, not accidental. **Verified**, though the `Folder.tsx` buttons above have no equivalent comment acknowledging them.
- **Breadcrumb/label/icon logic is centralized, not duplicated per feature.** `core/presentation/getPageDisplayLabel.ts`, `getPageIcon.ts`, `PageDisplayPlaceholders.ts`, `buildBreadcrumbs.ts`, `isNoteUntitled.ts` are each single-owner modules explicitly documented as shared by Notes and Daily Notes (e.g. `getPageDisplayLabel.ts:13-24`, `buildBreadcrumbs.ts` comments). `FolderTree.tsx:106-119` (Notes) and `DailyNotesList.tsx:103-116` (Daily Notes) both call `getPageDisplayLabel`/`getPageDisplayLabelStyle` rather than each re-deriving fallback text. **Verified.**
- **Toolbar/top-bar action building is a single registry, not four parallel implementations.** `topBarRegistry.tsx:36-44` maps `note`/`daily-note`/`folder`/`reserved-folder` to renderers; `note` and `daily-note` share the literal same `renderPageActions` function (`topBarRegistry.tsx:25-34`), differing only in which `buildNoteTopBarMenu`/`buildDailyNoteTopBarMenu` config array `buildTopBarActions.tsx` passes in (`buildTopBarActions.tsx:39-51`). **Verified.**

## Strengths

- Clean separation: layout shell components (`app/layouts/`) are pure and reusable; feature containers (`features/*/sidebar`) own the wiring; `core/presentation/*` owns cross-feature display rules. This three-tier shape is exactly what Rule 6/7 call for and it is followed consistently, including in the two under-built tabs (Tags/Tasks still go through the same `View`/`Section`/registry pattern, they just don't have real data behind the wiring yet).
- Single-owner presentation helpers (`getPageDisplayLabel`, `getPageIcon`, `buildBreadcrumbs`, `isNoteUntitled`) prevent the exact kind of per-feature duplication the architecture rules warn about (Rule 5, "never duplicate a business rule across files") — these aren't business rules in the Gate/facade sense, but the same discipline was clearly applied to presentation rules too.
- Placeholder controls that could mutate state are deliberately `disabled` (`Controls.tsx`, `tagsShortcuts.config.ts`, `tasksShortcuts.config.ts`) rather than wired to throwing/no-op handlers for genuinely new-record-creating actions — this matches Implementation Rule 12 ("never leave a stub wired to a live UI control") for the *creation* affordances specifically.
- `PageHost.tsx`'s own doc comment (`PageHost.tsx:28-37`) states its intended scope precisely ("no business logic or persistence logic") and the code matches that claim on inspection — every mutation goes through `application.pageOperations`/`application.folderOperations` methods, no direct Vault or filesystem access.

## Weaknesses

- **Inconsistent read-access surface**: Notes/DailyNotes read through `VaultQuery`; Tags/Tasks read through raw `Vault`. Neither is wrong per the spec, but the split has no documented rationale and makes "which object do I query from a sidebar panel" a case-by-case question instead of a convention.
- **Silently-inert controls that are not documented as placeholders**: `Folder.tsx`'s "+"/"…" buttons and `ResourceTopBarActions`' favorite/width-fill buttons have no `onClick` and no comment marking them as known-incomplete, unlike the `tagsShortcuts`/`tasksShortcuts` configs which explicitly say why they're disabled. A future contributor grepping for "why doesn't this button do anything" has no signpost here the way they do elsewhere in the same codebase.
- **`Task` row's checkbox looks actionable (has `isChecked`/`onCheckedChange` props) but is never given a handler** — worse than a disabled control, because a disabled control signals "not yet available" while an enabled-but-inert checkbox signals "this should work" and doesn't.
- **`groupTasks` is a stub that defeats the `Section`-per-group UI it feeds** — the component (`renderTasksByDate.ts`) is built to render multiple named `Section`s but currently only ever receives one (`all`), so the grouping affordance (collapsible headers) is visually present but semantically meaningless today.

## Hidden Assumptions

- `PageHost.tsx:203-205` assumes `page.type` can only ever be `'note' | 'daily-note'` for a persisted page and throws otherwise — correct today, but it means adding a third page type requires touching this file even though nothing else in the component signals that dependency at a glance. This is flagged in-code (a good sign) but is still a hidden coupling from "add a page type" to "PageHost's switch."
- The shared `renderPageActions` in `topBarRegistry.tsx` assumes Notes and Daily Notes will always want the same *shape* of overflow menu (same buttons, different item list) — reasonable today, but nothing enforces it if a Daily-Note-specific top-bar action is ever needed that doesn't fit the shared `ResourceTopBarActions` shape.

## Hidden Coupling

- `Sidebar.tsx` computes `activeDailyNoteDate` via `getActiveDailyNoteDate(vault, workspace.activePageId, pageOperations)` (`Sidebar.tsx:28-32`) and threads it down only to the `DailyNotes` panel — meaning `Sidebar.tsx` itself has to know Daily-Note-specific derivation logic even though it's otherwise a feature-agnostic tab shell. This is a small, intentional coupling (documented in `getActiveDailyNoteDate.ts`'s own comment) but it does mean `Sidebar.tsx` is not purely a generic tab container — it has one Daily-Notes-shaped computation baked in.
- `PageHost.tsx` holds a single `editorRef` (`useRef<MarkdownEditorHandle>`) shared across the draft and persisted-page render branches (`PageHost.tsx:48`), relying on the comment's claim that "only one of them ever renders per render" — true by construction (mutually exclusive `if` branches) but not enforced by the type system; a future third branch that also needs a body-focus ref must remember this convention.

## Behavior Analysis

See report 05 for the full user-facing behavior comparison. Key finding rooted in component composition: opening the Tags or Tasks tab presents a fully-styled, hover-responsive list (via the shared `Entry` component) that a user has every reason to expect behaves like the Notes list one tab over — click-to-open, checkbox-to-complete — but nothing happens on any interaction. This is a "same visual language, different actual capability" trap purely produced by how far the component composition (styling/entry components) has outpaced the wiring (click handlers, workspace integration).

## UX Analysis

- The sidebar's five tabs present four different levels of interactivity: DailyNotes (fully wired, richest — calendar, CTA, click-to-open, expand/collapse) > Notes (fully wired — folders, favorites, create) > Tags/Tasks (list-only, no interaction) > Search (no content at all). A first-time user tabbing across the sidebar gets no visual cue about this gradient; only trial-and-error (clicking a tag and observing nothing happens) reveals it.
- The overflow ("…") menu on both Note and Daily Note pages presents six items of which only two (Archive/Restore, Delete) function — the other four (description, duplicate, favorite, version history) close the menu and do nothing, which is a worse experience than omitting them, though it is a deliberate, documented interim state (Rule 12 is arguably in tension with this: the *items* are live UI controls wired to nothing, even though they don't literally "throw" — see Weaknesses).

## Product Analysis

The layout/component layer is generic and page-type-agnostic almost everywhere it can be — `Page`, `PageTopBar`, `Breadcrumbs`, `Section`, `View`, `Entry`-based row components are all reused without modification across Notes, Daily Notes, folders, and drafts. This is a solid foundation for adding new page types (Templates, Attachments per ARCHITECTURE_RULES.md's own examples) without touching the shell. The gap is entirely in feature completeness (Tags/Tasks/Search), not in architecture — closing it is "wire up existing TagOperations/TaskOperations facades once they exist" (already anticipated by ADR-012/013/014 per the code comments), not a redesign.

## Performance Analysis

- `FolderTree` recurses per folder level with no virtualization (`FolderTree.tsx`) — fine for typical vault sizes, but a vault with thousands of notes/folders would render the entire tree eagerly since `isExpanded` only hides children conditionally at render time, not via windowing. **Hypothesis**: not yet a problem, no evidence of profiling either way.
- `DailyNotesList` recomputes `collectMonthSections` (`DailyNotesList.tsx:30-53`) on every render by walking `query.getChildFolders` for every year then every month — O(years × months) folder lookups per render, cheap in absolute terms for realistic vault sizes but redundant work if `Sidebar` re-renders for unrelated reasons (e.g., `useVault` subscription firing on any vault mutation anywhere, not just Daily Notes changes) since there's no memoization. **Likely** immaterial given current app scale; worth flagging if vaults grow large.

## Scalability Analysis

- Sidebar tab list (`Sidebar.tsx:34-96`) is a hardcoded array of five tabs; adding a sixth (e.g., Templates, Attachments) means editing `Sidebar.tsx` directly rather than registering through an extension point — acceptable at current scale (this matches the spec's "no premature abstraction" philosophy) but is a manual, not declarative, extension point.
- The `topBarActionsRegistry` (`topBarRegistry.tsx:36-44`) *is* a declarative registry keyed by resource type — this is the pattern `PageHost.tsx`'s own comment (`PageHost.tsx:36-37`) predicts the page-dispatch `switch` will eventually need to become. Worth pointing future page-type work at this file as the template.

## Alternative Designs

- Tags/Tasks could read through `VaultQuery` for consistency with Notes/DailyNotes, with the raw-`Vault` projection getters (`tags()`/`tasks()`) either exposed via `VaultQuery` wrapper methods or left as the one documented exception — either is fine, but the current silent split should be resolved one way explicitly.
- A `useNavigationRouter`-style thin hook wrapping `useWorkspace` could reduce the amount of state Sidebar/PageHost manage locally (e.g., `activeTab` in `Sidebar.tsx:27` is local `useState`, not Workspace state — meaning switching sidebar tabs is not part of navigation history/state at all, an intentional but unremarked scope boundary).

## Trade-offs

Keeping Tags/Tasks components fully built (styled, `Entry`-based, prop-shaped for interactivity) *before* their backing facades exist is a genuine trade-off: it means the visual/UX shell is ready the moment `TagOperations`/`TaskOperations` land (low future cost), at the price of a materially misleading current-state UI (a user cannot tell "not built yet" from "broken" without inspecting the source). This mirrors ADR-012's disposition and appears to be a deliberate bet the team made consciously — but it's a real, live UX cost being paid today for future implementation speed.

## Confidence Level

**High** for the architectural-boundary findings (import/instantiation checks are grep-verifiable and exhaustive). **High** for the Tags/Tasks/Search inertness findings (read every relevant file end-to-end). **Medium** for performance/scalability claims (no profiling data available, reasoned from code structure only).

## Next Investigation Areas

- `core/vault/queries/VaultQuery.ts` itself — what it actually exposes vs. what `Vault` exposes directly, to determine whether the Notes/DailyNotes-vs-Tags/Tasks split is even resolvable without adding new `VaultQuery` methods.
- `components/entry/Entry.tsx` — the shared row primitive behind `Note`, `DailyNote`, `Tag`, `Task`, `Folder` — worth a design-system-focused pass to confirm hover/selected/disabled states are visually consistent given how much behavior they're being asked to represent (or not represent).
- Whether `activeTab` (sidebar tab selection) should move into `Workspace` given the spec explicitly scopes Workspace to "active page/folder, open pages, expanded folders" and doesn't mention sidebar tab — worth flagging to the navigation/data-model investigators as a possible Workspace scope question, not a bug.
