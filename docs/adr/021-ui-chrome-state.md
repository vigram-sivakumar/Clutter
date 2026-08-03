# ADR-021: UI Chrome State — Extend `Workspace` for Discrete Navigation-Shaped Toggles; Layout Geometry Stays Local

**Status:** Accepted (design frozen; implementation may proceed against this contract)

## Context

Dogfooding surfaced several related symptoms: the sidebar's hover caret is visible but clicking it doesn't visibly collapse a folder; sidebar tab selection isn't stable; several sidebar interactions (section headers, the sidebar-toggle button) have no shared state owner at all. Investigated as an architecture question, not five separate bugs, per the request that motivated this ADR.

### Inventory of current transient UI state

| State | Current owner | Shape | Gap |
|---|---|---|---|
| Active page / active folder | `Workspace` (`activePageId`/`activeFolderId`) | Discrete, mutually exclusive | None — correctly owned and consumed everywhere |
| Open pages (tabs-as-editor-sessions) | `Workspace` (`openPageIds`) | Set | None — consumed by `EffectivePageState` (ADR-020) |
| Folder expand/collapse | `Workspace` (`collapsedFolderIds`, `toggleFolderExpanded`, `isFolderExpanded`) | Set, keyed by folder id | **State is correct and complete. The bug is not architectural** — see below |
| Sidebar section collapse (Favorites/Folders headers) | `Sidebar.Notes.tsx`, local `useState` × 2 | Component-local boolean | No shared owner; resets on remount; identical shape to folder-collapse but reimplemented locally |
| Active sidebar tab (Daily Notes/Notes/Tasks/Tags/Search) | `Sidebar.tsx`, local `useState` | Component-local string | No shared owner; "not persisted" as reported is really "not lifted anywhere a persistence layer could ever reach it" |
| Sidebar panel visibility (show/hide) | Nowhere — `Controls`' sidebar-toggle button is `disabled`, by design, per ADR-016 | Doesn't exist | Confirmed placeholder, not a regression — `Controls.tsx`'s own comment: "no backing state exists for either yet" |
| Navigation history (back/forward) | Nowhere — same `Controls` buttons, same reason | Doesn't exist | Same as above, explicitly named in ADR-016 as future scope |
| Splitter/panel sizes (sidebar width) | Doesn't exist yet (no splitter component found) | N/A | Not yet built; named here so its shape is decided before it is |
| Active filters/search state | Doesn't exist — `SearchPanel.tsx` is a literal stub (`Work in progress...`) | N/A | Nothing to own yet |
| Selected sidebar item | `Workspace` (`activePageId`/`activeFolderId`, read via `selected={workspace.activePageId === entry.id}`) | Discrete | None — already correct, listed for completeness only |

### The caret symptom is an incomplete capability, not an architecture gap

Traced through `Caret.tsx` → `Folder.tsx` → `Entry.tsx` → `FolderTree.tsx`. The click-isolation is actually implemented correctly and redundantly: `Folder.tsx`'s caret button calls `event.stopPropagation()` before `onExpandToggle?.()`, and `Entry.tsx`'s own `handleClick` independently checks `event.target.closest('button, a, input, select, textarea, [role="button"]')` and returns early when the click originated on a nested interactive element — a second, independent guard against exactly this failure mode. `Workspace.isFolderExpanded`/`toggleFolderExpanded` are fully implemented and already wired: `FolderTree.tsx` passes both to `FolderEntry`.

**What's actually incomplete:** `FolderTree.tsx` reads `workspace.isFolderExpanded(folder.id)` only to set the caret's rotation (`isExpanded` prop, purely visual) — nothing gates whether `childPages`/the recursive `<FolderTree>` call actually render. `Workspace` already owns and correctly exposes the capability; `FolderTree` is the one remaining consumer that never finished wiring it through to rendering. The general pattern this needs already exists and is proven correct elsewhere in the same codebase: `Section.tsx` (used by `DailyNotesList`'s month sections and `Sidebar.Notes`' Favorites/Folders headers) already does `{isExpanded && <div className="section__content">{children}</div>}` correctly. This is a small, isolated, low-risk change requiring zero new state — completing an existing `Workspace` capability's last mile, not introducing one — folded into the roadmap below as its own milestone, decoupled from everything else in this ADR.

## Decision

### Design comparison

**A — Expand `Workspace` to own all of it, including layout geometry.** `Workspace` already declares "Own future tab and panel state" in its own doc comment, so this isn't baseless. Rejected as the *complete* answer: it would put a splitter's per-pixel drag updates through the same single `notify()` channel that drives full sidebar-tree re-renders (`AppLayout`'s `useVault`/`useWorkspace`-style subscription fans out broadly) — a real performance/granularity mismatch, not a hypothetical one, since a drag gesture can fire dozens of updates per second where every other `Workspace` mutation today is a discrete, human-paced click. Also risks `Workspace` becoming the reflexive dumping ground the task explicitly warned against.

**B — A wholly new, separate "UI chrome" subsystem for everything not-navigation.** Passes `ARCHITECTURE_RULES.md`'s bar for a new subsystem (a genuinely different category of concern — "how is the UI arranged" vs. `Workspace`'s "what content is the user looking at"). Rejected as the complete answer for the opposite reason from A: it would split `Workspace`'s already-correct, already-proven `collapsedFolderIds`/`isFolderExpanded` pattern away from a new, structurally identical `collapsedSectionIds`, forcing two near-identical mechanisms to live in two different objects for no functional reason — the same kind of avoidable fragmentation `ARCHITECTURE_RULES.md` rule 1 warns against, just on the UI-state side instead of the domain side.

**C — Split by genuine shape, not by a single blanket rule (adopted).** Discrete, low-frequency, "what's currently active/visible/collapsed" facts — sidebar active tab, sidebar section collapse, sidebar panel visibility — are the *same shape* `Workspace` already owns for folder collapse and active page/folder: boolean/enum, human-paced, naturally coarse-grained `notify()`. These extend `Workspace`, not because it's convenient, but because they pass the same test its own doc comment already set for itself ("own future tab and panel state") and because the mechanism (`collapsedFolderIds`'s exact shape) already exists, proven, one call away from generalizing. Continuous, high-frequency, currently-consumer-less state — splitter/panel geometry — does **not** extend `Workspace`: it has a different update cadence, no second consumer today (nothing but the splitter itself needs to read its own width), and per `implementation-rules.md`'s "shipped consumer" discipline (the same bar this session already applied to `EffectivePage`'s field set), building shared machinery for a value nothing else reads yet would be exactly the speculative-machinery pattern the architecture rules exist to prevent. It stays component-local until a second real consumer demonstrably needs it — most likely the eventual persistence layer, at which point it's a small, additive change, not a redesign.

### What extends `Workspace`

- `activeSidebarTab: string` + `setActiveSidebarTab(tab: string): void` — same shape as `activePageId`/`activeFolderId`.
- `collapsedSectionIds: Set<string>` + `toggleSectionExpanded(id: string): void` / `isSectionExpanded(id: string): boolean` — a new, parallel set, deliberately **not merged** with `collapsedFolderIds` into one generic "collapsed ids" structure. Folders and sections are different node kinds; a merged structure risks an id collision between a folder id and a section id (`'favorites'`/`'folders'`) for zero benefit — two small, explicit sets is the smaller, safer change over one generic one, and `collapsedFolderIds`'s existing, working implementation is left untouched.
- `isSidebarVisible: boolean` + `toggleSidebarVisible(): void` — unblocks `Controls`' sidebar-toggle button, closing the placeholder ADR-016 named.

Navigation history (`Controls`' back/forward buttons) is **not** decided here — it's a materially different shape (an ordered stack, not a discrete toggle) and ADR-016 already scoped it as separate future work; bundling it into this ADR would be exactly the "expand because it's nearby" reflex this task warned against avoiding.

### `Workspace`'s responsibility boundary, made explicit

`Workspace` owns **shared, session-scoped workspace state** — state that (a) more than one component needs to read or write, (b) is coarse-grained/discrete rather than continuous or high-frequency, and (c) describes what the workspace is currently showing or has currently toggled, the same category as its existing `activePageId`/`activeFolderId`/`openPageIds`/`collapsedFolderIds`. Passing this test is what justifies `activeSidebarTab`, `collapsedSectionIds`, and `isSidebarVisible` above — each is the same shape as state `Workspace` already correctly owns, not an expansion of what kind of thing it owns.

`Workspace` does **not** own transient UI state that fails any part of that test, regardless of how convenient it would be to have "one object for UI state." Named explicitly, so this isn't left to be rediscovered piecemeal later:

- **Search query / temporary filters** — feature-internal to whatever eventually consumes them (Search, a future filtered view); not shared across components today, and coupling `Workspace` to a search feature's query shape would be a dependency pointing the wrong way.
- **Dialog/modal visibility** — scoped to the dialog's own mount lifecycle; a dialog that needs to persist its open state across a remount is a sign something else is wrong, not a reason to lift it into `Workspace`.
- **Hover state** — inherently component-local and high-frequency (mouse-move-adjacent); the same granularity argument that keeps splitter geometry out applies here even more strongly.
- **Inline editing state** (e.g., a folder being renamed, a field mid-edit) — scoped to the editing component, the same pattern `pendingNewFolder` already establishes in `Sidebar.Notes.tsx`; promoting it to `Workspace` would make every editing gesture a workspace-wide notification for no consumer that needs it.
- **Ephemeral component state in general** (a component's own open/closed animation phase, a list's scroll position, form validation state, etc.) — the default is component-local `useState`; `Workspace` is not a catch-all replacement for it.

Splitter/panel sizes and search/filter state (already named above) are instances of this same boundary, not separate exceptions to it — repeated below for completeness with the rest of the "does not extend" list:

- Splitter/panel sizes: component-local state (or an uncontrolled/CSS-driven resize) until a second consumer exists.
- Search/filter state: feature-local, owned inside the eventual Search feature itself, the same pattern `Sidebar.Notes.tsx`'s `pendingNewFolder` already establishes for feature-scoped transient state that doesn't need cross-component sharing.

None of these are permanently forbidden from ever reaching `Workspace` — the boundary is the three-part test above, not a fixed list. If a future need genuinely produces shared, session-scoped, coarse-grained state of this kind (the same way `activeSidebarTab` does today), it's evaluated against the same test, not reflexively excluded because it appears on this list or reflexively included because `Workspace` already exists.

### Persistence

**Everything added here stays session-only**, consistent with ADR-006's deliberate, still-unrevoked stance: `.clutter/workspace.json`/a `WorkspaceSnapshot` serializer is explicitly named as future, additive, and gated on an actual product decision — not something this ADR triggers. `docs/architecture-evolution-roadmap.md` §3 already scopes this exact persistence work ("Folder Persistence (workspace-level)," sized S–M, zero dependencies) as a separate, later item; this ADR does not pull it forward. If/when that decision is made, every field this ADR adds becomes a natural, additive line in that serializer — nothing here needs to be redesigned to become persistable later.

### Explicitly out of scope

- The `docs/architecture-evolution-roadmap.md` §3 "Workspace Active-View Model" item (replacing `activePageId`/`activeFolderId` with a tagged `activeView` union to support "viewing Favorites"/"viewing All Tasks") is a different, larger, already-separately-scoped decision — it concerns which *content view* the main pane shows, not which *sidebar tab* is showing. Not touched here.
- Navigation history (back/forward) — ADR-016's scope, not this one.
- Splitter/panel geometry's eventual shared home, if a second consumer ever appears — deferred until that happens.

## Consequences

- `Workspace`'s zero-dependency status (`ARCHITECTURE_RULES.md` rule 7) is preserved — every addition here is more of what it already is, not a new kind of dependency.
- The caret/folder-collapse bug fix requires no part of this ADR and can ship first, independently.
- Three new, small, `Workspace`-owned pieces of state unblock: stable sidebar-tab selection, working section collapse (reusing the exact mechanism `collapsedFolderIds` already proved), and the sidebar-toggle button in `Controls`.
- Splitter sizing and search/filter state are named and scoped for later, not built speculatively now.

## Why This Approach Is Preferred

It resolves the actual tension in the request — neither reflexively expanding `Workspace` nor reflexively avoiding it — by testing each piece of state against what `Workspace` already correctly does (`collapsedFolderIds`'s shape) rather than against convenience or avoidance. It keeps the smallest architecture that removes scattered `useState` for the state that's actually shared and discrete, while declining to build shared machinery (a new subsystem, or cramming geometry into `Workspace`) for state that either doesn't need sharing yet (splitter, search) or would mismatch `Workspace`'s existing update-frequency contract if forced in.
