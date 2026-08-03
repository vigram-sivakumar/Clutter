# 08 — Feature Architecture Audit

Scope: `apps/app/src/features/` (collection, daily-notes, markdown, notes, search, tags, tasks) plus
a cross-cutting search for Favorites, Templates, Archive, Trash, and Assets anywhere in
`apps/app/src`. Method: every claim below is grounded in a file that was actually opened, not
inferred from folder names.

---

## Summary

The `features/` layer is, on the whole, compliant with the frozen architecture: every production
(non-test) file that imports `@core/vault/*` or `@core/application/*` does so with `import type`
only (Verified), meaning features hold no live references to concrete Vault/application classes
and cannot construct them — Rule 6 ("UI never constructs application-layer services") is respected
everywhere checked. There are **no** direct `PagePersistenceCoordinator`, `VaultFileSystem`, or
`.addPage/.replacePage/.removePage/.moveFolder` call sites inside `features/` (Verified). The two
`new VaultQuery(vault)` hits are both in `*.test.tsx` fixtures, not production code (Verified).

The most interesting finding is that **"collection" is not a distinct product concept** — it is the
view-model for "a folder rendered as a browsable list of its children," used generically for any
folder (Notes folders, Daily Notes month folders, Archive, Templates, Inbox) via `PageHost`'s
`activeFolderId` branch. It has no independent identity, no filter/query semantics, and no
relationship to "Collections" as usually understood in note-taking products (saved views, smart
folders). This is a naming risk directly relevant to the product report (see `10-product-architecture.md`).

Of the five features named in the mission but not covered by the folder scan (Favorites, Templates,
Archive, Trash, Assets): **Favorites and Archive are fully implemented**, **Templates is only a
reserved empty folder + a working "open" navigation stub with no actual templating capability**,
**Trash does not exist as a concept** (delete is permanent, hard-delete through the Gate), and
**Assets do not exist anywhere in the codebase** (zero matches for "asset" in `apps/app/src`).
**Search is a wired-but-unimplemented stub** (`return <>Work inprogress...</>;`), live in the sidebar
tab bar today — a borderline violation of implementation-rules.md Rule 12 ("never leave a stub wired
to a live UI control"), discussed under Weaknesses.

---

## Current Architecture

### Feature-by-feature inventory

**`collection/`** (Verified, `apps/app/src/features/collection/page/*`)
- `CollectionEntryModel.ts` / `CollectionPageModel.ts`: pure view-model types for one row (folder or
  note) and one page's worth of rows.
- `toCollectionPageModel.ts`: pure mapping function `(folder, VaultQuery, Workspace, actions) →
  CollectionPageModel`, reading child folders/pages via `VaultQuery.getChildFolders`/`getChildPages`
  (`apps/app/src/features/collection/page/toCollectionPageModel.ts:56-66`) and title/icon via
  `@core/presentation/getPageDisplayLabel`/`getPageIcon`.
- Sole consumer: `apps/app/src/app/layouts/page/PageHost.tsx:108`, inside the `if (activeFolderId)`
  branch — i.e. this is the "what to render when the active navigation target is a folder, not a
  page" case, used indiscriminately for every kind of folder in the vault.
- Rendered by `apps/app/src/app/layouts/page/body/CollectionBody.tsx`, a dumb list renderer.

**`daily-notes/`** (Verified)
- `calendar/`: pure presentational calendar grid (`Calendar.tsx`, `Month.tsx`, `Week.tsx`,
  `Date.tsx`, `Header.tsx`, `Weekdays.tsx`) plus pure date-math helpers (`getMonth`, `getWeek`,
  `moveCalendar`, `getCalendarTitle`, `datesWithNotes`) and models (`CalendarDate`, `CalendarMode`).
  No Vault/application imports beyond `import type { Page }` in `datesWithNotes.ts:1`.
- `helpers/findTodayNote.ts`: pure `Page[] → Page | null` filter using `isToday(note.name)`.
- `helpers/getActiveDailyNoteDate.ts`: reads `vault.getPage`/`pageOperations.getDraft` (both typed,
  narrowed via `Pick<...>`) to answer "what date is the active daily note," explicitly documented as
  the single source of truth so the calendar never keeps its own copy
  (`apps/app/src/features/daily-notes/helpers/getActiveDailyNoteDate.ts:4-13`).
- `sidebar/DailyNotesList.tsx`: **imports `DailyNotePath` as a value** (not type-only) from
  `@core/application/daily-notes/DailyNotePath` (`apps/app/src/features/daily-notes/sidebar/DailyNotesList.tsx:2`)
  and calls `DailyNotePath.monthIsoFromFolderNames(...)` — a static pure function, not a live
  service, so this doesn't violate Rule 6 (no instantiation, no facade construction), but it is the
  one production file in the whole `features/` tree that imports a concrete `@core/application`
  export by value rather than by type. See Hidden Coupling below.
- `topbar/dailyNoteTopBarMenu.config.ts`, `shortcuts/DailyNotesShortcuts.tsx`: menu/shortcut config,
  delegate all mutation to `PageOperations`/`NavigationRouter` passed in as typed props.

**`markdown/`** (Verified)
- `editor/MarkdownEditor.tsx`: the single editor component wrapping the underlying rich-text/markdown
  engine (`DocumentEditing`, per the spec). Receives `markdown`, `onEdit`, `onFlush` as props — no
  Vault or application imports at all. This is the cleanest-scoped feature folder: one component, one
  responsibility, zero cross-layer coupling.

**`notes/`** (Verified)
- `helpers/getFavoriteItems.ts`: maps `VaultQuery.getFavoriteFolders()`/`getFavoritePages()` into
  `FavoriteItem[]` (`apps/app/src/features/notes/helpers/getFavoriteItems.ts:38-47`).
- `models/FavoriteItem.ts`: view-model type only.
- `sidebar/FavoriteList.tsx`, `Folder.tsx`, `FolderTree.tsx`, `Note.tsx`, `NewFolderRow.tsx`,
  `Sidebar.Notes.tsx`: the Notes tab's tree UI. `Sidebar.Notes.tsx` receives `PageOperations`,
  `FolderOperations`, `NavigationRouter`, `VaultQuery`, `Workspace` as typed props
  (`apps/app/src/features/notes/sidebar/Sidebar.Notes.tsx:4-8`) and calls
  `folderOperations.create(name, parentId)` for new-folder commits
  (`apps/app/src/features/notes/sidebar/Sidebar.Notes.tsx:53`) — a real facade call, correctly
  routed, from inside a feature component.
- `shortcuts/`: `buildNotesShortcutHandler.ts` dispatches `new-note` → `pageOperations.openDraft(...)`,
  `inbox` → `navigation.openInbox()`, `templates` → `navigation.openTemplates()`
  (`apps/app/src/features/notes/shortcuts/buildNotesShortcutHandler.ts:12-23`) — all three are live,
  none throw.
- `topbar/noteTopBarMenu.config.ts`: menu config including an item with `icon: 'trash'` for the
  delete action (see Trash discussion below).

**`search/`** (Verified)
- `SearchPanel.tsx` is exactly:
  ```
  export function SearchPanel() {
    return <>Work inprogress...</>;
  }
  ```
  (`apps/app/src/features/search/SearchPanel.tsx:1-3`). It is imported and rendered live as the
  "search" tab's panel in `apps/app/src/app/layouts/sidebar/Sidebar.tsx:15,94` — a real, clickable
  sidebar tab a user can select today, which then shows literal placeholder text.

**`tags/`** (Verified)
- `helpers/renderTags.tsx`: pure `Tag[] → JSX` renderer.
- `sidebar/Sidebar.Tags.tsx`: reads `vault.tags()` directly (`apps/app/src/features/tags/sidebar/Sidebar.Tags.tsx:14`)
  — a read-only call on the domain model passed in as a typed prop, consistent with "features may
  read Vault, never mutate it."
- `sidebar/Tag.tsx`: presentational only.
- `shortcuts/buildTagsShortcutHandler.ts`: dispatches `create-tag` → `navigation.createTag()`, which
  **throws** (`apps/app/src/core/application/navigation/NavigationRouter.ts:50-52`) — but the config
  correctly marks it `disabled: true` (see `tagsShortcuts.config.ts`, mirrors the tasks case below),
  so the throwing path is unreachable from the UI. Compliant with Rule 12.

**`tasks/`** (Verified)
- `helpers/groupTasks.ts`, `renderTasksByDate.tsx`: pure functions/renderers over
  `TaskOccurrence` (`@core/vault/models/occurrences`), a derived/projected type — consistent with
  Rule 8 ("derived data is disposable"); tasks are read as a live Vault projection
  (`vault.tasks()`, `apps/app/src/features/tasks/sidebar/Sidebar.Tasks.tsx:14`), not stored
  independently.
- `shortcuts/buildTasksShortcutHandler.ts`: dispatches `create-task` → `navigation.createTask()`,
  which throws (`apps/app/src/core/application/navigation/NavigationRouter.ts:46-48`); the shortcut
  config marks it `disabled: true` with an explicit code comment citing ADR-012/013/014 and stating
  it "must never be clickable while it can only throw"
  (`apps/app/src/features/tasks/shortcuts/tasksShortcuts.config.ts:1-9`). This is a textbook example
  of the architecture's own rules being followed correctly under a known, tracked, deliberate gap —
  not an oversight.

### Favorites / Templates / Archive / Trash / Assets

| Capability | Status | Evidence |
|---|---|---|
| **Favorites** | **Fully implemented** (Verified) | `VaultQuery.getFavoriteFolders()`/`getFavoritePages()` (`apps/app/src/core/vault/queries/VaultQuery.ts:75-84`); `favorite: boolean` on both `PageMetadata` (`core/vault/models/PageMetadata.ts:7`) and `FolderMetadata` (`core/vault/models/FolderMetadata.ts:3`); write path is `PageOperations.updateMetadata` with `'favorite'` as one of the four editable metadata keys (`core/application/page/PageOperations.ts:44,803-818`) — i.e. Favorites has **no separate write path**, it rides `PageOperations`'s existing metadata capability, correctly per Rule 1/12. UI: `features/notes/sidebar/FavoriteList.tsx`, wired into `Sidebar.Notes.tsx`. |
| **Templates** | **Partially implemented** (Verified) | A reserved, empty top-level folder (`RESERVED_RESOURCES` / `RESERVED_FOLDER_IDS.templates = 'Templates'`, `core/vault/initialize/ReservedResources.ts:46,66`) plus a live, non-disabled shortcut (`notesShortcuts.config.ts:4`, no `disabled` flag) whose handler calls `navigation.openTemplates()` → `openReservedFolder('templates')` (`core/application/navigation/NavigationRouter.ts:36-38`). This **opens the folder as a generic Collection view** — there is no template *application* logic anywhere (no "new page from template," no template picker, no distinguishing a page-in-Templates/ from an ordinary note). The folder is real and browsable; the feature it names does not exist. |
| **Archive** | **Fully implemented** (Verified) | `PageOperations.archive(id)`/`.restore(id)` enqueue Gate operations (`core/vault/persistence/PagePersistenceCoordinator.ts:174-176`, `PageOperations.archiveRestore.test.ts`); wired to the topbar action in `PageHost.tsx:77-91`; a dedicated Footer button `onOpenArchive` opens the reserved Archive folder as a Collection view (`app/layouts/sidebar/Sidebar.tsx:118`). Explicitly decoupled from the `Archive/` folder's physical location — archived status is frontmatter (`status: archived`), not folder membership (`core/vault/initialize/ReservedResources.ts:92-95` comment). |
| **Trash** | **Does not exist as a concept** (Verified) | `PageOperations.delete(pageId)` closes the document session, cancels timers, drops the draft, and enqueues `{ kind: 'delete' }` through the Gate (`core/application/page/PageOperations.ts:845-855`), which calls `runDelete` → an actual filesystem unlink, not a move to any recoverable location (`docs/durability-model.md`, Stage 2 "Durable," under "Explicitly does not guarantee… Recoverability from deletion… deleteFile calls a direct filesystem unlink… Once a delete operation completes, this stage provides no path back"). The word "trash" appears **only** as an icon name (`icon: 'trash'`) on the Delete menu item in `notes/topbar/noteTopBarMenu.config.ts:44` and `daily-notes/topbar/dailyNoteTopBarMenu.config.ts:31` — a UI icon choice, not a feature. |
| **Assets** | **Not implemented at all** (Verified) | Zero matches for "asset" (case-insensitive) anywhere under `apps/app/src`. No embedded-image/attachment model, no asset folder convention, no reference in `RESERVED_RESOURCES`. |

---

## Evidence

All file:line citations above are drawn from direct reads of the cited files during this
investigation (not inferred). Key ones repeated for convenience:

- `apps/app/src/features/collection/page/toCollectionPageModel.ts:50-75` — the entire "collection" concept.
- `apps/app/src/app/layouts/page/PageHost.tsx:101-127` — `collection` is reached only from the generic `activeFolderId` branch, for any folder.
- `apps/app/src/features/search/SearchPanel.tsx:1-3` and `apps/app/src/app/layouts/sidebar/Sidebar.tsx:15,94` — Search stub, live-wired.
- `apps/app/src/core/application/navigation/NavigationRouter.ts:46-52` — `createTask`/`createTag` throw.
- `apps/app/src/features/tasks/shortcuts/tasksShortcuts.config.ts:1-9` — the corresponding UI control correctly disabled.
- `apps/app/src/core/vault/persistence/PagePersistenceCoordinator.ts:174-181` — `delete` is a Gate operation kind alongside `save`/`archive`/`restore`/`move`, confirming exactly one write path per capability (Rule 12).
- `apps/app/src/core/application/daily-notes/DailyNotePath.ts:1-9,30-40` — path-string construction (`${this.ROOT}/${year}/${month}/${day}.md`) living in `core/application/daily-notes/`, outside `vault/ingest/VaultPath.ts` and `platform/`.

---

## Strengths

1. **Rule 6 compliance is essentially total.** Every production feature file that touches
   Vault/application types does so via `import type`; the only concrete-value import
   (`DailyNotePath`) is a stateless static-method utility, not a service instance, and calling it
   performs no I/O and no Vault mutation. (Verified)
2. **The `disabled: true` pattern for `createTask`/`createTag` is exactly the discipline
   implementation-rules.md Rule 12 asks for**, complete with a code comment naming the blocking
   dependency (a future `TaskOperations`/`TagOperations` facade) and the ADRs that established the
   disposition. This is evidence the frozen-architecture discipline is being followed in practice,
   not just documented. (Verified)
3. **Favorites is a clean example of "extend an existing facade, don't invent a new write path."**
   It required zero new subsystems — one metadata field, one existing `updateMetadata` call.
   (Verified)
4. **Derived-data discipline (Rule 8) holds for tags and tasks** — both are read live off `Vault`
   projections (`vault.tags()`, `vault.tasks()`), never independently stored by the feature layer.
   (Verified)
5. **`markdown/` is the best-scoped feature folder in the codebase** — one file, no cross-layer
   imports, does exactly one thing.

---

## Weaknesses

1. **Search is a live, reachable stub.** `SearchPanel.tsx` renders literal placeholder text and is
   wired into the sidebar tab bar as one of five always-visible tabs (`Sidebar.tsx:85-94`), with no
   `disabled` treatment. This is functionally different from the `createTask`/`createTag` case: those
   are single disabled menu rows; Search is an entire tab a user can click into and receive a
   dead-end. Implementation-rules.md Rule 12 says "a method that isn't implemented yet must not be
   reachable from a button, menu item, or shortcut a user can actually trigger — either implement it,
   or disable/remove the control until it is." The tab is reachable and not disabled. (Verified stub
   content and live wiring; **Likely** a rule-12 violation in spirit, though Rule 12 is phrased around
   methods/actions rather than whole panels, so this is a judgment call, not a mechanical violation.)
2. **"Templates" half-exists in a way that could mislead a future implementer.** The folder,
   reserved-resource entry, and a working, non-disabled "open Templates" navigation action all exist,
   giving the *impression* of a shipped feature, while the actual templating capability (apply a
   template to create a page) has zero implementation. Because the entry point isn't disabled the way
   `createTask`/`createTag` are, this is a milder but real version of the same "half-built affordance"
   pattern ADR-006 explicitly warns against for `workspace.json` ("building out persistence for a
   feature with no confirmed product requirement would repeat that pattern").
3. **`DailyNotePath`'s path-string construction sits outside the one place Rule 10 designates
   (`vault/ingest/VaultPath.ts`) and outside `platform/`.** Rule 10's stated scope is path *parsing*
   ("splitting on `/`, computing parent directories, checking prefixes") and `DailyNotePath` only
   *constructs* new path strings via template-literal concatenation
   (`core/application/daily-notes/DailyNotePath.ts:31-40`) — arguably a different operation than the
   rule's enforcement examples target, but it is still string-level path semantics living in a third
   location. (**Likely** a gap in Rule 10's scope, not a clear-cut violation — flagged for
   escalation rather than asserted as a defect, per implementation-rules.md §5's own instruction to
   stop and flag rather than improvise a judgment.)
4. **No asset/attachment model at all** means every note is effectively text-only; any future image
   embed, file attachment, or drag-and-drop would be new-aggregate work with no existing scaffolding
   to extend (see `10-product-architecture.md`).

---

## Hidden Assumptions

- **A folder is always safe to render generically as a Collection.** `toCollectionPageModel` makes no
  distinction between a user-created folder, `Archive/`, `Templates/`, or a Daily Notes month folder
  — it assumes "list of child folders + child pages" is always the right view for any folder. This
  assumption is currently true because no folder needs a different view, but it's untested against a
  folder type that would (e.g., a virtual/smart folder — see product report).
- **`getActiveDailyNoteDate`'s single-source-of-truth comment assumes a single active page at a
  time** (`apps/app/src/features/daily-notes/helpers/getActiveDailyNoteDate.ts:4-13`) — correct today,
  but names "the calendar's only source of 'which date is selected'" as `Workspace.activePageId`,
  which is a single scalar. A future multi-tab/multi-panel feature (explicitly flagged as anticipated
  in ADR-006's amendment, `docs/adr/006-workspace-separation.md`) would need this helper reworked.
- **Favorites assumes folders and pages are the only favoritable entities** — the model
  (`FavoriteItem`) has exactly two `type` values, `'note' | 'folder'`. Any future favoritable
  entity (a tag, a saved search) is not representable without extending this type.

---

## Hidden Coupling

- `DailyNotesList.tsx` couples the Daily Notes sidebar UI directly to `DailyNotePath`'s internal
  month-name format (`DailyNotePath.monthIsoFromFolderNames`, `apps/app/src/features/daily-notes/sidebar/DailyNotesList.tsx:44-47`)
  to reverse-engineer an ISO month from folder names — i.e., the feature layer depends on the exact
  string convention the persistence layer uses to name folders, mediated through one shared utility
  rather than being duplicated, which is good, but it does mean any future change to the Daily Notes
  folder-naming convention (e.g., zero-padded month numbers instead of month names) is a breaking
  change reaching directly into `features/daily-notes/`.
- `PageHost.tsx` (an `app/layouts/` file, not a feature file) is the actual composition point that
  decides collection-vs-note-vs-draft rendering; `features/collection/` has no independent existence
  outside being imported by exactly one file. This is a one-directional coupling (fine per the
  dependency rules — features may be imported by `app/`), but it means "collection" as a folder under
  `features/` is organizationally misleading: it reads as a peer of `notes`/`tags`/`tasks` but is
  actually a view-model helper for `app/layouts/page/PageHost.tsx`.

---

## Behavior Analysis

- Opening any folder (Notes folder, Daily Notes month folder, Archive, Templates, Inbox) renders
  identically: title, description, cover image, then two flat lists (folders, then notes) with no
  further grouping, sorting control, or filtering exposed to the user beyond `VaultQuery`'s existing
  `getChildFolders`/`getChildPages` order.
- The Templates and Inbox shortcuts behave identically to opening any ordinary folder — clicking
  "Templates" is observably indistinguishable from navigating to any other empty folder, except for
  the icon and title. A user has no way to discover that "Templates" is supposed to mean something
  more than "a folder named Templates."
- Search's tab click produces a visible sidebar panel change with static text, no input field, no
  loading state, no empty state — it's a single unconditional render.
- `createTask`/`createTag` shortcuts render as visually disabled rows (per the config), so a user
  cannot trigger the throw; this is correct end-to-end behavior for a documented "not yet built"
  aggregate.

---

## UX Analysis

- The Search tab occupies a permanent, prominent slot (one of five sidebar tabs) for a feature that
  provides zero value today — worse for perceived product quality than simply omitting the tab, since
  users will click it expecting search and find nothing.
- Templates, similarly, presents a plausible, clickable affordance ("Templates" with a template icon)
  that resolves to an empty folder rather than a template picker — likely to read as a bug ("I made a
  template, why is the folder empty?" is not actually possible today since there's no way to *create*
  a template either) rather than an intentionally staged rollout.
- The disabled-with-tooltip-free `createTask`/`createTag` rows are honest about being unavailable
  (greyed out, non-clickable) — better UX honesty than Search/Templates, even though the underlying
  capability gap (no `TaskOperations`/`TagOperations` facade) is the same *kind* of gap.

---

## Product Analysis

- "Collection" is confirmed (Verified) to have no relationship to any user-facing "Collections"
  concept — it is purely "folder browse view." If Clutter's product roadmap later wants Smart
  Collections (saved filtered views), reusing the name "Collection" for that user-facing feature would
  collide with this internal name for an unrelated thing, risking either confusing internal
  documentation or a rename churn across `features/collection/`, `PageHost.tsx`, and
  `CollectionBody.tsx`. Recommend treating this as a naming-only concern to resolve *before* any
  Smart Collections work starts, not during it.
- The Favorites and Archive features demonstrate the intended shape for future aggregate-scale
  features cleanly: extend `PageOperations`/`FolderOperations` metadata or add a Gate operation kind,
  never a new write path. Templates and Search are the two visible counter-examples where a plausible
  product surface exists in the UI without the backing capability, which is a legitimate readiness
  gap.
- Trash's total absence (permanent hard-delete only) is a real product risk independent of
  architecture — see `docs/durability-model.md`'s explicit statement that delete provides "no path
  back." A future "recently deleted" feature is not a small addition; it needs a new soft-delete
  concept the current Gate operation-kind model doesn't have (delete today *is* physical removal, not
  a state transition the way archive is).

---

## Performance Analysis

- `toCollectionPageModel` recomputes the full child list on every render with no memoization observed
  (`apps/app/src/features/collection/page/toCollectionPageModel.ts:56-66`) — fine at current expected
  vault sizes (a personal notes vault), but would need indexing/pagination if a folder ever held
  thousands of children; no evidence this has been load-tested.
- `DailyNotesList.collectMonthSections` iterates all year folders × all month folders on every render
  (`apps/app/src/features/daily-notes/sidebar/DailyNotesList.tsx:30-53`) with no caching — same
  category of concern, bounded by "how many years of daily notes exist," likely fine for years but
  worth flagging if the app is used for a decade+.
- No feature-layer code was found doing anything I/O-bound or async beyond calling already-async
  facade methods (`folderOperations.create`, `pageOperations.archive`, etc.), so most performance risk
  in this layer is rendering cost, not I/O cost.

---

## Scalability Analysis

- **Feature-count scalability:** the current pattern (helpers/ shortcuts/ sidebar/ topbar/ per
  feature, each a thin presentation/mapping layer over facade calls) scales well to more features of
  the same shape (create/list/select an aggregate). It does **not** by itself define a pattern for a
  feature needing its own persistent state beyond Page/Folder metadata (e.g., Templates needing a
  "this page is a template" concept, or Assets needing binary storage) — those are new-aggregate
  problems the spec explicitly anticipates (`docs/implementation-rules.md` §6, "When a new
  service/facade is allowed... only for a new aggregate that doesn't fit PageOperations/FolderOperations
  (e.g., Templates, Attachments)").
- **"Collection" as a generic folder-view will not scale to non-folder-shaped collections** (a smart
  view spanning multiple folders, a tag-based view) without a genuinely new view-model input beyond
  `Folder` — today's function signature is `toCollectionPageModel(folder: Folder, ...)`, hard-coupled
  to a single `Folder` as the source of the list.

---

## Alternative Designs

1. **Rename `features/collection/` to `features/folder-browse/` (or fold it into `notes/` as
   `notes/folder-view/`).** Removes the name collision risk with a future Smart Collections feature
   and makes its actual scope ("render a folder's children") self-evident from the folder name.
2. **Gate the Search tab behind a feature flag or omit it until implemented**, consistent with how
   `createTask`/`createTag` are gated — closes the Rule 12 gap discussed above with the smallest
   possible change (a `disabled`/hidden flag on the tab definition in `Sidebar.tsx`).
3. **Split "Templates" into two explicit states in the UI**: an "open Templates folder" affordance
   (today's actual behavior, fine as-is if relabeled/re-iconed to not imply more) versus a future,
   separately-gated "Apply Template" capability once a `TemplateOperations`-shaped facade exists —
   avoids the current single control implying a capability that isn't there.
4. **Introduce a soft-delete Gate operation kind (`'trash'`) distinct from `'delete'`** as the shape
   any future Trash feature would need — a new operation kind on the existing Gate, not a new
   subsystem, matching Rule 1/12's "one owner, one write path" pattern already used for archive.

---

## Trade-offs

- Renaming `collection/` is low-risk, low-cost, and purely organizational — no behavior change — but
  requires touching `PageHost.tsx`'s import and any test fixtures; worth doing before a Smart
  Collections feature exists to actually collide with, per Rule 5 ("never move a responsibility... as
  a side effect of an unrelated change" — renaming now, unforced, is cheaper than renaming later under
  the pressure of an actual naming conflict).
- Hiding the Search tab removes visible "coming soon" signaling a product team might actually want
  (roadmap transparency) — a genuine product trade-off, not just an engineering one; worth a product
  decision, not a unilateral engineering fix.
- A `'trash'` Gate operation kind is the architecturally consistent answer but is real, non-trivial
  scope (a "restore from trash" facade method, a retention/expiry policy, UI for a trash view) — not
  a small change, flagged here as a sizing note for whoever picks it up.

---

## Confidence Level

- **Verified**: feature folder inventory, import patterns (type-only vs. value), Favorites/Archive
  full implementation, Search stub content and wiring, Templates folder-only status,
  createTask/createTag throw-and-disabled pairing, Trash/Assets non-existence, delete permanence per
  durability-model.md.
- **Likely**: whether Search's live-wiring counts as a Rule 12 violation in the strict sense (the rule
  is worded around actions/methods, not whole panels) — flagged as a judgment call, not asserted as a
  clear-cut breach.
- **Hypothesis**: `DailyNotePath`'s scope relative to Rule 10 — plausible reading either way; recommend
  an explicit ADR note or Rule 10 clarification rather than treating it as settled by this report.
- **Unknown**: whether Templates/Search/Trash absences are deliberately sequenced (a real roadmap
  exists) or simply unscheduled — nothing in the docs read during this investigation states a product
  roadmap; `10-product-architecture.md` treats these as open questions rather than assuming intent.

---

## Next Investigation Areas

1. Read `docs/adr/017-draft-page-lifecycle.md` in full against `PageOperations.openDraft`/`getDraft`
   to confirm the draft model has no gaps relevant to a future Templates feature (a template is
   plausibly "a draft with a different source"), since draft machinery already exists and might be the
   natural extension point rather than a wholly new aggregate.
2. Investigate whether `VaultQuery` has (or could cheaply gain) a filtered/cross-folder query shape,
   which would determine how hard "Smart Collections" or "Pinned pages" would be to build — see
   `10-product-architecture.md`.
3. Confirm whether any ESLint import-boundary rule referenced in `ARCHITECTURE_RULES.md` (rules 2, 3,
   4, 6, 7) is actually configured in this repo's `.eslintrc`/`eslint.config.*`, since several rules
   describe it as "the target mechanical enforcement" rather than confirmed-present — if absent, the
   type-only-import discipline found here is currently convention-enforced only, not tooling-enforced.
4. Audit `app/layouts/` (outside `features/`) for the same reach-around patterns checked here — this
   report only scoped `features/`; `PageHost.tsx`, `Sidebar.tsx`, and friends were read incidentally
   and looked compliant, but were not exhaustively audited.
