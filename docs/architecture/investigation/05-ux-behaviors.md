# 05 — UX Behavior Analysis: Notes vs Daily Notes vs Tags vs Tasks

Scope: inferred *runtime, user-perceived* behavior from `features/notes/**`, `features/daily-notes/**`, `features/tags/**`, `features/tasks/**`, their `sidebar/`, `shortcuts/`, `topbar/`, `helpers/` subfolders, plus the shared rendering path in `app/layouts/page/PageHost.tsx` and `core/presentation/**`.

## Summary

Of the four sidebar "domains" the tab bar presents as peers (Daily Notes, Notes, Tasks, Tags), only two — Daily Notes and Notes — are real, interactive features. Tags and Tasks are visually complete but functionally inert: nothing is clickable, nothing selects, nothing persists, and task-grouping is an explicit TODO. This is not an accidental leak; it is documented, deliberate, gated behind unbuilt `TagOperations`/`TaskOperations` facades (ADR-012/013/014). But it means the product, as it runs today, presents four equally-weighted tabs of which half do nothing — a materially different experience than "half the app isn't built yet" communicates visually.

Notes and Daily Notes are close to true duplicates in editing behavior — `PageHost.tsx` explicitly documents that they "render identically today (both markdown-editable, both resolve through the same view-model builders)" — but diverge meaningfully in **sidebar presentation** (a static folder tree vs. a calendar + "Start your day" CTA), **placeholder copy** ("New Note" vs. "Start typing..."), and **identity semantics** (a Note can be untitled and renamed; a Daily Note's name is a permanent calendar date, never "untitled"). These divergences are principled and intentional, each backed by a comment explaining why the same underlying question (`isNoteUntitled` vs. `getPageDisplayLabel`'s filename check) is answered differently for the two types.

The `features/*/shortcuts/` folders that the investigation brief asked about are **not keyboard shortcuts** — there is no key-binding/hotkey system in the app at all (confirmed by grep: the only real keyboard handling anywhere is `Enter`/`Escape` inside `EditableText.tsx` for inline title editing, plus generic menu arrow-key navigation in `useMenuKeyboard.ts`). "Shortcuts" here means a per-tab row of quick-action buttons (New / Inbox / Templates), a UI-vocabulary choice worth flagging since it doesn't match what a reader would expect from the term.

## Current Architecture

Editing/persistence path (shared): `PageHost.tsx` branches on `workspace.activeFolderId`/`activePageId`, then on whether a `Page` exists in `Vault` vs. only a `PageOperations` draft descriptor, then — for a persisted page — asserts `page.type` is `'note' | 'daily-note'` and renders both through the same `toResourcePageModel` → `MarkdownEditor` path (`PageHost.tsx:194-236`).

Sidebar presentation path (divergent): `Sidebar.Notes.tsx` renders `NotesShortcuts` (3 static rows) + `FavoriteList` + recursive `FolderTree`. `Sidebar.DailyNotes.tsx` renders `DailyNotesShortcuts` (a `Calendar` widget + conditional CTA button) + `DailyNotesList` (chronological month `Section`s, newest first). `Sidebar.Tags.tsx`/`Sidebar.Tasks.tsx` render a flat, single-`Section` list with no navigation state at all.

## Evidence

### Notes vs Daily Notes — editing behavior

- **Identical editor and save path.** `PageHost.tsx:203-213`: both types pass through the same `page.type !== 'note' && page.type !== 'daily-note'` guard, the same `toResourcePageModel(...)`, the same `MarkdownEditor`. Comment at `PageHost.tsx:196-202` states this explicitly: "Note and Daily Note render identically today... this guard exists because page.type is user-editable frontmatter... not because rendering differs." **Verified.**
- **Different title-editing semantics.** `toResourcePageModel.ts:31`: `title: isNoteUntitled(page) ? '' : page.name`. `isNoteUntitled.ts:23-24`: always `false` for `'daily-note'`, so a Daily Note's title field always shows its real date-derived name and is **not** presented as an editable-with-placeholder field the way an untitled Note is — even though both page types set `titleEditable` (`PageHost.tsx:169,221` both pass `titleEditable` truthy/`true`). Practically: a user can click into a Daily Note's title and type over its date, same as a Note's title, but a Daily Note never *starts* in the "click here to name it" placeholder state a fresh Note does. **Verified**, from reading `isNoteUntitled.ts` and `toResourcePageModel.ts` together.
- **Different placeholder copy.** `PageDisplayPlaceholders.ts:10-12`: `getPageTitlePlaceholder` returns `'Start typing...'` for `daily-note`, `'New Note'` for everything else. This copy reaches three surfaces identically for both types: the page header placeholder (`Page.tsx` via `titlePlaceholder`), the sidebar fallback label (`getPageDisplayLabel.ts:44`), and breadcrumbs (`buildBreadcrumbs.ts`'s `entryBreadcrumbTitle`). **Verified.**
- **Different default icon.** `getPageIcon.ts:14-19`: `note` → `squiggleLine`, `daily-note` → `calendar`. Sidebar tab bar icons also differ (`Sidebar.tsx:41-42,67-68`): `calendarToday` for the Daily Notes tab, `squiggleLine` for Notes.
- **Different overflow menu.** `noteTopBarMenu.config.ts` includes `duplicate` and `add-to-favorite`; `dailyNoteTopBarMenu.config.ts` omits both (compare the two files directly — Daily Note's menu is a strict subset: description, version-history, archive/restore, delete). A user can favorite/duplicate a Note but not a Daily Note from the overflow menu. **Verified** — this is a real, if minor, behavioral asymmetry with no comment explaining the product reasoning (only a cross-reference comment noting the *pattern* is shared, not why the item sets differ).
- **Different empty-state framing.** A brand-new Note opens as a blank page with title placeholder "New Note" and no other chrome. A Daily Note additionally exposes a "Start your day..." call-to-action *in the sidebar* (`DailyNotesShortcuts.tsx:52-59`) that is visible only when today has neither a persisted note nor an open draft (`isTodayOpen` check, `DailyNotesShortcuts.tsx:44`), and disappears the instant today is opened (persisted or drafted) — matching test coverage in `DailyNotesShortcuts.test.tsx`. Notes has no equivalent "you have nothing yet, start here" CTA in its own sidebar tab — `NotesShortcuts` is just three static rows regardless of vault content.

### Notes vs Daily Notes — sidebar structure

- Notes: static hierarchical folder tree, manual expand/collapse per folder (`workspace.isFolderExpanded`/`toggleFolderExpanded`, `FolderTree.tsx:100-104`), a separate always-editable "Favorites" section, and inline folder creation (`NewFolderRow`, `Sidebar.Notes.tsx:39-57`).
- Daily Notes: computed, not user-organizable — `DailyNotesList.tsx:30-53` derives month `Section`s purely from the reserved `daily-notes` folder's actual year/month subfolder structure and sorts them newest-first (`DailyNotesList.tsx:56`); a month section with zero notes is filtered out entirely (`DailyNotesList.tsx:82-86`, explicit comment: "independent of how the month folder itself came to exist"). There is no manual folder creation UI for Daily Notes — the folder chain is only ever materialized at persist time via `DailyNoteService.ensureFolderChain` (referenced in comments, not directly audited here).
- **This is a legitimate product difference, not incidental duplication**: Notes needs user-driven organization (arbitrary folders); Daily Notes needs date-driven organization (calendar). Unifying these into one tree component would fight the calendar's actual structure. **Verified as principled**, not historical accident — every divergence point has an explanatory comment in the source.

### Selection / hover / expansion in the sidebar tree

- Selected state for both Notes and Daily Notes reads directly off `Workspace`: `FolderTree.tsx:100,116,150` (`workspace.activeFolderId === folder.id`, `workspace.activePageId === note.id`), `DailyNotesList.tsx:113` (`workspace.activePageId === note.id`). Single source of truth, no locally-duplicated "selected" state. **Verified.**
- Expansion state for both reads off `Workspace.isFolderExpanded`/`toggleFolderExpanded` (`FolderTree.tsx:101-102`, `DailyNotesList.tsx:88,97-98`) — Daily Notes' month sections and Notes' folders share the exact same expand/collapse mechanism, keyed by folder id in both cases (a month folder is a real `Folder` in the Vault domain model, so this "just works" without a parallel expansion-state system). **Verified**, and this is a good example of the domain model doing double duty cleanly rather than each feature reinventing expand/collapse state.
- Tags/Tasks have **no** selection state at all — no `workspace` prop is even passed to `Sidebar.Tags.tsx`/`Sidebar.Tasks.tsx` (confirmed in report 04's evidence). A user cannot tell, by looking at the Tags or Tasks tab, "what's currently open" the way they can in Notes/Daily Notes, because there is no concept of an active tag/task page to select.
- Hover state: not investigated at the state-management level (this is CSS-driven per the `Entry` component, not React state) — **Unknown** whether hover styling differs meaningfully between Tag/Task/Note/DailyNote/Folder rows; would require reading `components/entry/Entry.css` and friends, out of this report's traced dependency chain.

### Tags vs Tasks sidebars — inertness

- Both receive only `{ vault, navigation }` as props (`Sidebar.Tags.tsx:8-11`, `Sidebar.Tasks.tsx:8-11`) — no `workspace`, no `onOpen`, no `pageOperations`/`folderOperations`.
- `renderTags.ts:9`: every `Tag` row's `onClick={() => {}}` — clicking a tag literally does nothing.
- `renderTasksByDate.ts:29`: every `Task` row's `onClick={() => {}}`, and no `onCheckedChange` is passed at all, so the `Checkbox` inside `Task.tsx:37` renders but toggling it has zero effect — worse than a disabled control, because nothing in the UI indicates it's non-functional (no `disabled` prop is set on the checkbox).
- `groupTasks.ts:6-13` is an explicit stub: a `TODO` comment states "Restore semantic grouping (today, overdue, upcoming) once the vault Task model supports extracted due dates" and the function currently returns everything under a single `all` key, regardless of what `renderTasksByDate.ts`'s own now-stale comment (`renderTasksByDate.ts:19-20`, also a TODO) implies about Today/Overdue/Upcoming/Completed grouping.
- Both "New" buttons (`tagsShortcuts.config.ts`, `tasksShortcuts.config.ts`) are `disabled: true` with an identical explanatory comment citing ADR-012/013/014/016, confirming this is a intentional, tracked incompleteness rather than a bug. **Verified.**
- **Net effect for a user**: opening Tags or Tasks shows a plausible-looking, correctly-styled list (using the same `Entry`/`Badge`/`Checkbox`/`CountBadge` components as everywhere else in the app) that is 100% non-interactive. There is no in-app signal (banner, "coming soon" label, greyed-out state) distinguishing this from a bug.

### Keyboard navigation / "shortcuts" — a naming mismatch, not a feature

- `features/notes/shortcuts/`, `features/daily-notes/shortcuts/`, `features/tags/shortcuts/`, `features/tasks/shortcuts/` all contain a `*Shortcuts.tsx` presentational component (a `Section` of `Navigation` rows or, for Daily Notes, a `Calendar` + CTA) and a `build*ShortcutHandler.ts` that maps a **click** id to a `NavigationRouter`/`PageOperations` call. None of these bind to `keydown`/`onKeyDown` or register any global hotkey.
- Codebase-wide search for real keyboard handling (`useKeyboard|useHotkey|useShortcut|keydown|KeyboardEvent`) returns exactly three non-test files: `components/overlay/hooks/useEscape.ts`, `components/menu/useMenuKeyboard.ts` (arrow-key navigation inside an open menu), and `components/editable-text/EditableText.tsx` (`Enter` commits, `Escape` discards — `EditableText.tsx:101-123`). **Verified: there is no application-level keyboard-shortcut system** (no Cmd+N, no Cmd+K, no arrow-key note navigation).
- Product implication: the "shortcuts" naming across four features is really "sidebar quick-action bar." This is a low-stakes naming choice today but will actively mislead anyone who later builds real keyboard shortcuts and looks for `features/*/shortcuts/` as the place to extend, unless they read the code first (as this investigation did).

## Strengths

- Every actual divergence found between Notes and Daily Notes is explained by an in-code comment tracing back to a specific reason (identity semantics, calendar structure, ADR references) — this is unusually well-documented UX-decision provenance for a codebase of this size.
- Shared presentation single-owners (`getPageDisplayLabel`, `getPageTitlePlaceholder`, `getPageIcon`, `buildBreadcrumbs`, `isNoteUntitled`) mean the two types cannot silently drift on the questions those functions answer — a future edit to placeholder copy, say, is a one-line change that both types pick up automatically.
- Expansion/selection state genuinely is unified (Workspace-backed) across Notes and Daily Notes, avoiding a common anti-pattern of parallel per-feature "which row is open" state.

## Weaknesses

- Tags/Tasks tabs are shipped in a state indistinguishable, from inside the running app, from "broken." No placeholder banner, no disabled styling on the rows themselves (only the "New" button is visibly disabled), no tooltip.
- `Task`'s checkbox is enabled-looking but non-functional — this is the single most likely "user thinks something is broken" interaction point in the whole audited surface, because unlike a disabled button it invites a click and gives no feedback.
- Note vs Daily Note overflow-menu item sets differ (`duplicate`, `add-to-favorite` present only for Notes) without any comment explaining the product rationale — worth confirming with product whether this is intentional or an oversight, since every *other* divergence in the codebase has a stated reason and this one doesn't.
- The word "shortcuts" is overloaded to mean "sidebar action row," with no real keyboard-shortcut system existing anywhere in the app today — worth flagging before a future contributor builds on the wrong mental model.

## Hidden Assumptions

- `PageHost.tsx`'s `page.type !== 'note' && page.type !== 'daily-note'` guard (line 203) hard-assumes exactly two markdown-editable page types exist. Every one of the "shared" behaviors documented above (identical editor, identical `toResourcePageModel`, identical `topBarActionsRegistry` renderer) is implicitly built on that assumption; a third markdown page type would need to be added to this guard *and* explicitly decide whether it wants the Note or Daily-Note menu/placeholder/icon treatment, since neither `noteTopBarMenu`/`dailyNoteTopBarMenu` nor `getPageTitlePlaceholder`/`getPageIcon` have a generic fallback branch beyond the two known types (`getPageIcon.ts`'s `switch` has no `default`, so TypeScript would catch a missing case at compile time — a good safety net).
- The Daily-Notes-specific "Start your day..." CTA logic (`isTodayOpen` in `DailyNotesShortcuts.tsx:44`) assumes `activeDate` fully captures both persisted and draft state via `getActiveDailyNoteDate` — correct today per that function's own contract, but any future path that opens a Daily Note without going through `Workspace.activePageId` (e.g., a hypothetical multi-pane view) would silently break the CTA's visibility logic.

## Hidden Coupling

- `Sidebar.tsx` is coupled to Daily-Notes-specific derivation logic (`getActiveDailyNoteDate`) even though it's structurally a generic tab shell (see report 04). This means Notes/Tags/Tasks tabs pay a small, unnecessary re-render/computation cost (the date derivation runs on every `Sidebar` render, not just when Daily Notes tab is active) — **Likely** negligible in practice given the derivation is cheap, but it is a layering smell: the "generic" shell has one feature's concern baked in.
- Tags/Tasks' bypass of `VaultQuery` in favor of raw `Vault` access (see report 04) is a hidden coupling risk if `VaultQuery` is ever the place gating/authorization/filtering gets added — those two tabs would silently not receive whatever `VaultQuery` gains, since they never call it.

## Behavior Analysis

Concrete user-observable behavior differences, as a user would describe them:

| Aspect | Notes | Daily Notes | Tags | Tasks |
|---|---|---|---|---|
| Sidebar content | Folder tree + Favorites, user-organizable | Calendar + month-grouped list, date-organized | Flat badge list | Flat checkbox list, one group |
| Click a row | Opens the note | Opens the daily note | Nothing happens | Nothing happens |
| Create new | "New" button → blank draft | "Start your day..." CTA (only shown when today isn't open) | "New" button, visibly disabled | "New" button, visibly disabled |
| Title placeholder | "New Note" | "Start typing..." | N/A | N/A |
| Checkbox / status toggle | N/A | N/A | N/A | Renders, does nothing |
| Overflow menu extras | Duplicate, Add to favorite (inert), Description, Version history (inert) | Description, Version history (inert) — no Duplicate/Favorite | N/A | N/A |
| Selection highlight | Yes (Workspace-backed) | Yes (Workspace-backed) | No | No |

## UX Analysis

The two working features (Notes, Daily Notes) present a coherent, well-thought-through experience with intentional, documented micro-differences that respect each type's actual identity model (arbitrary user content vs. calendar-anchored content). The two non-working features (Tags, Tasks) sit in the same tab bar, styled with the same design-system components, at the same visual weight — creating an expectation gap the moment a user tries to interact with them. This is the single highest-impact finding for product/UX stakeholders: **the tab bar currently overstates what's built**, even though the underlying code is honest about it (via comments) to anyone who reads the source.

## Product Analysis

Given ADR-012/013/014's disposition (Tags/Tasks blocked on `TagOperations`/`TaskOperations` facades, deliberately deferred), the current state is a reasonable engineering sequencing choice — but it's worth flagging to product/design that the *current shipped UI* doesn't communicate "not yet available" the way the disabled "New" buttons do for creation. A minimal fix (visually distinguishing inert rows, or an inline "Coming soon" note in the section header) would close the gap between "what the architecture docs say is intentional" and "what a user experiences" without requiring any facade work.

## Performance Analysis

No performance concerns specific to these behavioral differences beyond what's noted in report 04 (FolderTree recursion, DailyNotesList recomputation). Tags/Tasks panels are cheap to render precisely because they do nothing.

## Scalability Analysis

The pattern used for Notes/Daily Notes (shared presentation helpers + per-type config objects like `noteTopBarMenu.config.ts`/`dailyNoteTopBarMenu.config.ts`) scales cleanly to a future third page type — new config file, new icon case, extend one `switch`. The Tags/Tasks inertness is a known, bounded gap (facade-blocked), not an architectural scalability problem.

## Alternative Designs

- A shared `SidebarListItem` interaction contract (click → open, with a documented no-op fallback) could make the "this tab is inert" state a single, declarative flag rather than four separately-authored `onClick={() => {}}` call sites — reducing the risk that one gets wired up while the other is forgotten when `TagOperations`/`TaskOperations` eventually land.
- Overflow-menu items with no handler (`duplicate`, `add-to-favorite`, `add-a-description`, `version-history`) could be rendered `disabled` the same way `archive`/`delete` already are for drafts (`disabled: !persisted` pattern in `noteTopBarMenu.config.ts`), rather than being clickable-but-inert — this would bring them into compliance with the spirit of Implementation Rule 12 even though they're technically "reachable UI, not a throwing stub."

## Trade-offs

Shipping Tags/Tasks visually complete ahead of their facades is explicitly a bet that the UX cost of "looks done, isn't" is worth paying to have zero remaining UI work once the facades land. That's a defensible call, but it's a product decision, not merely an engineering one, and the current code gives no in-app signal that the decision was made deliberately — it only exists in commit history/ADRs a user will never see.

## Confidence Level

**High** across all major claims in this report — every behavioral divergence and every inert-control finding was traced to specific, read, first-party source files rather than inferred from naming or documentation alone. **Medium** on hover-state specifics (not traced into CSS) and on whether the Note/Daily-Note overflow-menu item-set difference is intentional (no comment either confirms or denies the reasoning).

## Next Investigation Areas

- `core/vault/queries/VaultQuery.ts` and `core/vault/models/Vault.ts`'s `tags()`/`tasks()` projections — for the data-model investigator: confirm whether `Tag`/`TaskOccurrence` models already carry enough information (due dates, etc.) to support the grouping `groupTasks.ts` currently stubs out, or whether that's genuinely blocked on a data-model change.
- `docs/adr/012`, `013`, `014`, `016` — read in full to confirm the exact scope/timeline commitment behind "Tags/Tasks are deliberately inert for now," since this report inferred intent from code comments referencing those ADRs rather than reading them directly.
- `components/entry/Entry.tsx` and its CSS — for the design-system investigator: whether a lightweight "inert" visual variant could be added cheaply to close the perception gap flagged above without waiting on the facades.
- Whether `activeTab` state (which sidebar tab is open) belongs in `Workspace` per its stated scope ("open pages, expanded folders") — currently local `useState` in `Sidebar.tsx`, worth a navigation-architecture investigator's judgment call (see report 06).
