# ADR-035: Persist Workspace Session State — `WorkspaceSessionStore` Observes `Workspace`

**Status:** Accepted (design frozen; **not yet implemented** — implementation proceeds only on separate approval, against this contract)

## Context

Product now requires Clutter to restore the user's workspace when the app restarts: the last thing they were looking at, which sidebar tab was showing, whether the sidebar was hidden, and which folders/sections/Daily Notes ranges were open or closed.

None of that survives a restart today, and this is by design, not by accident:

- [ADR-006](./006-workspace-separation.md) kept `Workspace` a separate, zero-dependency, in-memory-only subsystem and explicitly declined to build `.clutter/workspace.json` persistence "until session-restore-on-reopen becomes an actual product requirement" — naming a future "deliberate, scoped addition" through `VaultFileSystem`, not something to half-build.
- [ADR-021](./021-ui-chrome-state.md) lifted `activeSidebarTab`, `collapsedSectionIds`, and `isSidebarVisible` into `Workspace` and stated "everything added here stays session-only," while noting that each field "becomes a natural, additive line" in a future serializer.
- [ADR-022](./022-workspace-favorites-active-view.md) replaced `activePageId`/`activeFolderId` with one `ActiveView` union — the single value that now identifies "what the main pane is showing."
- [ADR-033](./033-fold-state-persistence.md) made `.clutter/workspace.json` live (fold state), and explicitly declined to generalize into a `WorkspaceSnapshot`, deferring that to "a separate, later ADR" once a real requirement exists — naming two compatible extension shapes: a sibling top-level key, or a sibling store.
- [ADR-019](./019-retire-boot-time-daily-note-scaffolding.md)/[ADR-025](./025-fallback-page-on-delete.md) established `Application.open()` → `openFallbackPage()` (today's Daily Note) as the Composition Root's one documented seam for a future startup strategy ("Open Today's Note / Restore Last Session / Open Empty Workspace").

These decisions were correct for their time: they deliberately held a non-persistence boundary around `Workspace` until a concrete product requirement justified crossing it. That requirement now exists. This ADR is the "separate, later ADR" those decisions anticipated; it amends only their non-persistence stance, nothing else about them.

### Investigation findings (state as of this ADR)

`.clutter/workspace.json` already has four independent owners, each owning disjoint top-level keys through the shared `readWorkspaceStateFileText`/`mergeAndWriteWorkspaceStateFile` helpers (`core/vault/initialize/workspaceStateFile.ts`), each loaded once in `Application.bootstrap()`, in-memory-authoritative, fire-and-forget persisted, tolerant of missing/malformed content:

| Key(s) | Owner |
|---|---|
| `foldState`, `embedCollapse` | `FoldStateStore` (ADR-033) |
| `collectionViewConfig` | `CollectionViewConfigStore` |
| `tasksViewConfig` | `TasksViewConfigStore` |
| `tagExpansion` | `TagExpansionStore` |

The state this ADR concerns has no persistence owner:

| State | Runtime owner today |
|---|---|
| Active sidebar tab | `Workspace._activeSidebarTab` (default `'daily-notes'`) |
| Active view | `Workspace._activeView` (`ActiveView` union) |
| Sidebar visibility | `Workspace._isSidebarVisible` |
| Notes folder collapse | `Workspace.collapsedFolderIds` (stores *collapsed* ids; default expanded) |
| Sidebar section collapse | `Workspace.collapsedSectionIds` (`'favorites'`, `'folders'`) |
| Daily Notes Earlier / Upcoming expanded | Component-local `useState` in `DailyNotesList.tsx` — resets on every sidebar-tab switch, since the panel unmounts |

Daily Notes month-section headers are not independently collapsible today (`DailyNotesList` renders `<Section hasHeader>` with no `onExpandedChange`), so Earlier/Upcoming are the only Daily Notes expansion state that exists to persist.

Sidebar width is already persisted, separately, via `localStorage` (`useSidebarWidth.ts`, key `clutter-sidebar-width`) — app-global, not per-vault.

Three adjacent issues surfaced and are recorded below as implementation requirements: `mergeAndWriteWorkspaceStateFile` has an unserialized read-modify-write race; no `.clutter/workspace.json` key has schema versioning; `TagOperations.rename()` migrates `collectionViewConfig` but not `tagExpansion`.

## Decision

### 1. Ownership: `Workspace` stays the runtime owner; `WorkspaceSessionStore` owns the persisted snapshot

- **`Workspace`** remains the sole runtime owner and mutator of every field listed below. It gains no filesystem, storage, or `Vault` dependency, no `load()`/`save()`, and no knowledge that persistence exists. ADR-006's zero-dependency invariant and ARCHITECTURE_RULES.md rule 7 are preserved exactly.
- **`WorkspaceSessionStore`** (new, `core/application/workspace/WorkspaceSessionStore.ts` or equivalent `core/application` location) owns the persisted snapshot of that state, end-to-end — one reader, one writer of the `workspaceSession` key — the same single-owner shape `FoldStateStore`/`TasksViewConfigStore`/`TagExpansionStore` already establish. It is constructed and loaded by the Composition Root, exposed as `application.workspaceSessionStore`, and:
  1. at boot, **seeds** `Workspace` through `Workspace`'s own public setters; then
  2. after startup restoration completes, **observes** `Workspace` via `Workspace.subscribe()` and persists a snapshot when the persisted subset changes.
- It is **not** Gate-backed: `.clutter/*` is application infrastructure, outside the Persistence Gate by ARCHITECTURE_RULES.md rule 2's own Scope paragraph — the same reasoning ADR-033 applied.

### 2. Persisted state (exactly this, nothing more)

**Navigation**
- `activeSidebarTab`
- `activeView` — the full `ActiveView` union (ADR-022), not only `activePageId`, so a user last viewing a folder, a tag, Favorites, or a Tasks collection is restored to it.

**Sidebar**
- `visible` — sidebar visibility
- `collapsedSections` — `Workspace.collapsedSectionIds`
- `notes.collapsedFolderIds` — `Workspace.collapsedFolderIds`
- `dailyNotes.earlierExpanded`, `dailyNotes.upcomingExpanded`

**Daily Notes runtime owner.** Earlier/Upcoming currently have no shared owner. Persisting them gives them a second consumer, which is exactly the trigger ADR-021's three-part test named (shared, discrete/human-paced, describes what the workspace is currently showing). They are therefore lifted into `Workspace` as explicit, Daily-Notes-specific state — not merged into `collapsedSectionIds` (opposite default polarity: these default to *collapsed*; and ADR-021 already rejected merging different node kinds into one id set). `WorkspaceSessionStore` then observes a single runtime owner for everything it persists. `DailyNotesList`'s `scrollToDate` auto-expand writes through the same setter and is persisted like any other expansion change (the same way `setFolderExpanded` on reveal already behaves).

**Explicitly not persisted** (remain transient, component-local or runtime-only): menus, popovers, modals, hover, drag state, temporary reveal/highlight state (`pendingReveal`, sidebar note reveal), text selection/cursor/focus, pending navigation requests, loading state, notifications, editor history (`editorHistoryCache`), navigation history (back/forward stacks), open-pages list (`openPageIds`), and search query/results. Per-page editor state (e.g. scroll position) is a separate future concern and not part of this ADR.

### 3. Existing stores remain independent

`WorkspaceSessionStore` complements, never replaces, the four existing owners. No existing key moves, is renamed, or changes owner:

- `foldState`/`embedCollapse` → `FoldStateStore`
- `collectionViewConfig` → `CollectionViewConfigStore`
- `tasksViewConfig` → `TasksViewConfigStore` (already persists Tasks' *Show completed* / *Auto-sort completed* — the only user-controlled Tasks view configuration that exists)
- `tagExpansion` → `TagExpansionStore` (Tags sidebar expansion is already persisted; no second mechanism is introduced)

### 4. Persisted format

One new top-level key in `.clutter/workspace.json`, alongside the existing ones:

```jsonc
"workspaceSession": {
  "version": 1,
  "navigation": {
    "activeSidebarTab": "notes",
    "activeView": { "type": "page", "id": "<pageId>" }
    // or { "type": "folder", "id": "<folderId>" }
    // or { "type": "filtered-view", "view": { "kind": "tag", "tagName": "project" } }
  },
  "sidebar": {
    "visible": true,
    "collapsedSections": ["favorites"],
    "notes":      { "collapsedFolderIds": ["<folderId>"] },
    "dailyNotes": { "earlierExpanded": false, "upcomingExpanded": true }
  }
}
```

- The shape mirrors actual state ownership (navigation vs. sidebar chrome), not a generic catch-all UI-state bag. A future persisted concern with its own owner (editor, search, collections) gets its own top-level key and its own store — not a new field here — unless it is genuinely `Workspace`-owned session state, evaluated against ADR-021's test.
- Set-valued fields are stored as arrays in the same polarity as their runtime owner (folders/sections as *collapsed*, matching `Workspace`), so an entity never seen before resolves to the runtime default with no special-casing.
- `activeView: null` / absent means "nothing to restore."

### 5. Versioning, migration, and field-level validation

- `workspaceSession.version` is a per-key integer schema version, starting at `1`. Load runs `raw → migrate(fromVersion → current) → validate/normalize`. A missing `version` on a present object is treated as `1`.
- A `version` *newer* than the running app understands (a downgrade) is treated as absent: defaults apply for the session and the next write replaces it. Accepted, documented loss for a rare scenario.
- Additive changes (a new optional field) do **not** bump `version` — field-level validation already defaults a missing field. Only a breaking reshape bumps it and adds a migration step.
- **Validation is field-level.** Each field is parsed independently against its own type; a malformed field falls back to its own default and never causes valid sibling fields to be discarded. Unknown fields are dropped. A malformed *whole file* or a non-object `workspaceSession` falls back to all defaults with `console.warn`, never thrown — the same never-block-boot posture every existing `.clutter/workspace.json` owner has.
- This per-key versioning convention is introduced by `workspaceSession`; it is **not** retrofitted onto the four existing keys by this ADR (they continue to be read as unversioned = their current shape).

### 6. Invalid / stale state

| Case | Behavior |
|---|---|
| Unknown or malformed `activeSidebarTab` | Use `Workspace`'s existing default (`'daily-notes'`). Valid values are the sidebar's actual tab set. |
| `activeView.type === 'page'` whose id is not a current `Vault` page | Discard; use the existing fallback (§7). |
| `activeView.type === 'folder'` whose id is not a current `Vault` folder | Discard; use the existing fallback. |
| `activeView.type === 'filtered-view'` with an unknown `kind`, or `kind: 'tag'` whose tag no longer exists | Discard; use the existing fallback. |
| Draft page as the active view | **Never persisted.** A draft (ADR-017) has no `Vault` entry and does not survive restart; when the active view is a draft, the persisted `activeView` is written as `null` (nothing to restore → fallback), never the draft's id. |
| `collapsedFolderIds` containing ids not in the current `Vault` | Ignored at seed time (only ids present in the booted `Vault` are applied to `Workspace`); since every write snapshots `Workspace`, unknown ids are pruned from disk on the next write. |
| `collapsedSections` containing unknown ids | Harmless (no entity to resolve); kept if strings, dropped if not. |
| Malformed `visible` / `earlierExpanded` / `upcomingExpanded` | That field's default (`true` / `false` / `false`). |

### 7. Startup and restore lifecycle (mandatory order)

```text
Application.bootstrap()
  1. scan + build Vault                                   (unchanged)
  2. load existing stores                                 (unchanged)
  3. WorkspaceSessionStore.load()  — parse → migrate → field-level validate; never throws
  4. construct Application, attachVault()                 (unchanged)
  5. seed Workspace chrome from the snapshot:
       activeSidebarTab, sidebar visibility, collapsedSections,
       collapsedFolderIds (filtered to ids present in Vault),
       Daily Notes earlier/upcoming
     — pure in-memory setter calls; no persistence subscription yet
Application.open()
  6. start watcher                                        (unchanged)
  7. startup strategy (the ADR-019/025 seam):
       if the saved activeView validates against the current Vault → restore it
       else → openFallbackPage()  (today's Daily Note, unchanged)
  8. only after 7 has completed: WorkspaceSessionStore subscribes to Workspace
     and begins persisting
AppShell renders
```

- **Ordering is mandatory.** Subscribing before step 7 completes would let seeding, default state, or the fallback navigation overwrite the saved session before it is restored.
- **Restoration records no navigation history.** It goes through the existing entry point for that `ActiveView` variant (`PageOperations.open`, `FolderOperations.open`, or the filtered-view navigation entry point) with `recordHistory: false` where the entry point supports it; `activeView` being `null` at boot is the backstop (ADR-027's "no current view to remember" guard), not the mechanism relied on.
- **Scope of the strategy change:** only *boot* gains a restore branch. `openFallbackPage()` itself is unchanged and remains the delete-time fallback (ADR-025): deleting the active page mid-session still falls back to today's Daily Note, never to a "restored" view.
- The user-facing contract: **on successful restart, restore the last valid active view; if it is no longer valid, fall back to the existing startup behavior.** This is "restore last session," not "always open today's Daily Note." A user whose last view was yesterday's Daily Note is returned to yesterday's Daily Note.

### 8. Write behavior

- `Workspace.notify()` fires for many changes `WorkspaceSessionStore` does not persist (open pages, history stacks, draft-title `refresh()`). The store compares the persisted subset against its last written snapshot and writes only when it changed.
- Writes are debounced (short trailing delay, order of a few hundred ms) and flushed from `Application.close()`. Fire-and-forget, best-effort: a lost final write on abrupt process termination is accepted, the same posture every existing `.clutter/*` writer documents.
- **Durability stage:** this is application infrastructure state, not Vault content — it does not pass through the Committed → Durable → Reconciled pipeline in `docs/durability-model.md`, and this ADR changes no guarantee of any of those stages.

### 9. Implementation requirements recorded by this ADR

1. **Serialize `.clutter/workspace.json` writes.** `mergeAndWriteWorkspaceStateFile` currently reads, merges, then writes with no in-process serialization; two owners persisting concurrently can each read the same base, and the later write reinstates the other's stale key. `WorkspaceSessionStore` adds the most frequent writer to this file, so all mutations of it must go through a single in-process write queue (inside the shared helper, so every existing owner benefits without changing its API). Atomic write-then-rename and any broader durability redesign remain **out of scope** (`docs/durability-model.md`).
2. **Tag rename must migrate `tagExpansion`.** `TagOperations.rename()` already calls `CollectionViewConfigStore.renameKey()`; it must equally move the old name's membership in `TagExpansionStore` to the new name. This is an adjacent correctness fix to already-persisted state, delivered with this work, not a change to `TagExpansionStore`'s ownership.
3. **`Workspace` public API additions** limited to what seeding and the Daily Notes lift require — idempotent setters (e.g. an exact-value sidebar-visibility setter alongside `toggleSidebarVisible()`) and the Daily Notes earlier/upcoming state — all in-memory, all notifying through the existing `notify()`.

### 10. Folder identity limitation (accepted)

Folder collapse is keyed by existing folder ids — the existing identity mechanism (`IdentityResolver`: frontmatter id when a `.folder.md` carries one, otherwise path-derived) is the source of truth. When a folder's id is path-derived and the folder is renamed or moved such that its id changes, its previous collapse state does not follow it; the folder returns to its default (expanded). This ADR does not introduce a new persistent folder identity system (consistent with the project's ID/path identity decision: no new ids without a concrete driver).

### 11. Sidebar width — explicitly out of scope

Sidebar width stays where it is (`localStorage`, `useSidebarWidth.ts`) and is **not** part of `workspaceSession`. Moving it into `.clutter/workspace.json` would change its semantics from **app-global** to **per-vault** — a product decision, not an architectural default. ADR-021's reason for keeping geometry out of `Workspace` (continuous, high-frequency drag updates vs. `Workspace`'s coarse `notify()` channel) also still holds. If width is later moved, that is a separate, explicitly-approved decision (likely its own sibling key with a one-time import from `clutter-sidebar-width`), not an implicit consequence of this ADR.

## Alternatives Considered

1. **Keep `Workspace` state session-only (status quo).** Rejected: the product now requires session continuity — the exact trigger ADR-006 and ADR-021 said would justify persistence.
2. **Add filesystem persistence directly inside `Workspace`** (`load()`/`save()` on the class). Rejected: couples the runtime state owner to I/O, breaking `Workspace`'s zero-dependency invariant (ADR-006, rule 7) — the same reason ADR-033 rejected it for fold state.
3. **One consolidated workspace-state store owning every `.clutter/workspace.json` key.** Rejected: the four existing stores already have clear, single ownership and working consumers; consolidating them yields no product or architectural benefit, adds a data migration, and would turn one store into a cross-domain dumping ground (fold state is editor content state; collection/tasks config is presentation state; neither is `Workspace` state).
4. **`WorkspaceSessionStore` as a sibling store that seeds and observes `Workspace`.** **Chosen.** Reuses the established `.clutter/workspace.json` infrastructure and the established one-owner-per-key pattern; keeps `Workspace` a pure runtime owner; scales to additional `Workspace`-owned session state by adding fields here, and to non-`Workspace` state by adding sibling stores, without ever turning `Workspace` into a persistence service.

Also considered: **persisting `activePageId` only** — rejected, since `ActiveView` (ADR-022) is already the single serializable value for what the main pane shows, and a page-only field would silently drop folder/filtered-view sessions. **Persisting `openPageIds` and navigation history** — not required by the product requirement; deferred.

## Relationship to Previous ADRs

- **ADR-006** — amended in one respect only: `Workspace`'s tracked state is no longer categorically non-persisted. Everything else stands: `Workspace` remains separate from `Vault`, zero-dependency, and in-memory as an object; persistence is a sibling concern, exactly the "deliberate, scoped addition… through `VaultFileSystem`" ADR-006 named.
- **ADR-021** — its "everything added here stays session-only" clause is amended for `activeSidebarTab`, `collapsedSectionIds`, and `isSidebarVisible`; its ownership test, its boundary list, and its layout-geometry decision are unchanged (and are applied here to lift Daily Notes earlier/upcoming into `Workspace`).
- **ADR-022** — unchanged; its `ActiveView` union is the persisted navigation value.
- **ADR-033** — unchanged; this ADR takes the "sibling top-level key + sibling store" extension shape ADR-033 named, and does not generalize `FoldStateStore`.
- **ADR-019 / ADR-025** — the startup seam they named gains its first non-default branch (restore last valid view); `openFallbackPage()`'s policy and its delete-time use are unchanged.
- **ADR-027** — restoration is not a recorded navigation; history stacks are not persisted.

## Consequences

- `docs/architecture-specification.md` §10 is amended: `Workspace` itself remains in-memory, but its session state is persisted by `WorkspaceSessionStore`, outside `Workspace`.
- `.clutter/workspace.json` gains a fifth owner and a fifth top-level key (`workspaceSession`), and the first per-key schema version.
- Boot gains one load step (bootstrap), one seed step (bootstrap), one restore branch (`open()`), and one deferred subscription (end of `open()`).
- Three implementation requirements ride with this work: write serialization for `.clutter/workspace.json`, `tagExpansion` migration on tag rename, and minimal in-memory `Workspace` setter additions.
- Known accepted limitations: path-derived folder ids lose collapse state across rename/move; a downgrade discards a newer `workspaceSession`; a final write can be lost on abrupt termination; non-atomic writes remain out of scope.

## Why This Approach Is Preferred

It crosses the non-persistence boundary ADR-006 and ADR-021 deliberately held, at exactly the point and in exactly the shape they anticipated — a separate persistence owner through `VaultFileSystem`, a sibling key in the file ADR-033 already brought to life — while changing nothing about what `Workspace` is. Every mechanism it relies on (the shared workspace-state helpers, single-owner stores, tolerant boot-time loading, the startup seam, `ActiveView`, `Workspace.subscribe()`) already exists and is proven; the only genuinely new contracts are the restore ordering, field-level versioned validation, and serialized writes, each scoped to the state this requirement actually needs.
