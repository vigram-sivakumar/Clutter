# ADR-052: Per-note References display preferences — `.clutter/workspace.json`, not frontmatter, not the Gate

**Status:** Accepted (product decision, Vigram, 2026-10-13). Extends [ADR-033](./033-fold-state-persistence.md)'s "sibling top-level key / sibling store" extension point; the menu action follows [ADR-048](./048-canonical-resource-actions.md).

## Context

A note's References section (the inbound references under the body) had only transient, component-local state: always shown when there was anything to list, always starting expanded. Product now wants two per-note preferences that survive note switches and application restarts:

1. **Visibility** — "Hide references" / "Show references" in the page topbar menu.
2. **Expansion** — the section's expanded/collapsed chevron.

They must be independent (hiding must not reset expansion), must default to today's behavior for notes with no saved value, and must not modify reference data (detection, indexing, navigation).

An empty section already renders nothing (`References` returns `null` with no lists). That is **automatic hiding**; it must stay, and an **explicit** "Show references" must override it (the section then shows, with a `0 References` header, even when empty). So visibility is a three-state preference, not a boolean.

## Decision

A new `ReferencesDisplayStore` (`core/application/references/`), a sibling of `TagExpansionStore` / `FoldStateStore`, owns one top-level key of `.clutter/workspace.json`:

```jsonc
"referencesDisplay": {
  "<pageId>": { "hidden": true, "collapsed": true }
}
```

- **Keyed by immutable page id** (the frontmatter `id`): survives rename, move, archive and restore. Duplicate creates a new id, so a copy starts at the defaults (ADR-028).
- **Only non-default values are stored.** An absent entry means *automatic visibility, expanded*. `collapsed` is stored only as `true`. `hidden` is stored as either value because it is a tri-state:
  - absent — automatic: shown when the note has references, hidden when it has none;
  - `true` — the user chose Hide references: never shown;
  - `false` — the user chose Show references: shown even when empty.
- **Independent flags.** `setHidden` never reads or writes `collapsed`, and vice versa; an entry with neither field is removed. Hiding then showing restores the saved expansion, including across a restart.
- **Observable store** (same `subscribe`/`notify` shape as `TagExpansionStore`) so the topbar menu and the section react to one another; a `useReferencesDisplayStore` hook subscribes React.
- **Writes** go through `mergeAndWriteWorkspaceStateFile` (the one serialized read-merge-write queue), fire-and-forget, in-memory authoritative. `load()` is tolerant: invalid JSON, a non-object key, or a malformed entry is discarded (per entry where possible) with a `console.warn`, never thrown.
- **Page delete** calls `clear(pageId)` next to `foldStateStore.clear`, so a deleted page leaves no entry behind.
- **Wiring:** constructed once in `Application.bootstrap()` and exposed as `application.referencesDisplayStore` (trailing constructor parameter with an `empty()` default, like every other store). PageHost reads it through the hook and passes plain values and callbacks to `PageReferences`/`References` and the topbar.
- **Menu:** one definition, `toggle-references`, group `view`, order 10, for `note` and `daily-note` (the only kinds that render References). Label `Hide references` / `Show references` from a new `ResourceActionContext.referencesHidden` fact (true when the section is not currently displayed — an explicit hide *or* an automatically hidden empty section — so the label always names what the click will do). Availability: `activeOnly` (hidden for archived notes, as for Properties) and `persistedOnly` (disabled on the topbar for a draft, ADR-017 item 9). The sidebar/favorites profile omits it. Placement follows the group logic: between Create template and Reveal in Finder, divider above and below.
- **Menu is not coupled to reference detection for availability** — the action is always offered on an eligible note. Only its *label* reads whether the section is currently displayed, which PageHost derives from the same reference list it already passes to the section (computed once, memoized on the knowledge graph; detection itself is unchanged).

## Durability (see [durability-model.md](../durability-model.md))

This change affects **none of the three stages**. Committed, Durable and Reconciled describe note content and metadata that flows through `DocumentEditing`, the Persistence Gate and Sync; this state is neither. It is Clutter-owned application configuration under `.clutter/*`, outside the Gate by design (ARCHITECTURE_RULES.md rule 2, Scope note).

Its guarantee is the same best-effort posture ADR-033 accepted for fold state:

- the store is authoritative in memory for the session; the file is a whole-file, in-place, non-atomic write handed to the OS (no fsync, no write-then-rename);
- the write is fire-and-forget: **if the application is terminated before the write completes, the most recent preference change (or changes) can be lost, and the note reverts to its previous saved value or the default.** This is an accepted risk — a lost display preference is cosmetic and never touches note content;
- a corrupted or hand-edited file degrades to defaults and never blocks startup;
- a stale entry for a page that no longer exists is inert.

## Alternatives Considered

- **Page metadata / frontmatter (the `coverHidden` pattern).** Rejected. It would touch ~13 files (`PageMetadata`, `PageFrontmatter`, owned keys, parser, serializer, `resolvePageMetadata`, `PageRebuilder`, `EditablePageMetadata`, the patch translators, `PagePersistenceCoordinator`, `EffectivePageState`, `toResourcePageModel`, PageHost) and add Gate concurrency tests, and every chevron click would rewrite the user's Markdown file and bump `modified`, reordering recency-sorted lists. It would also write a viewer preference into the user's file and carry it through Duplicate, templates and sync. ADR-033 (including its `embedCollapse` amendment, the closest analogue) already settled that per-page UI state belongs in `workspace.json`.
- **Extend `FoldStateStore`.** Rejected: it is editor fold/embed state keyed to document content; References display is unrelated to editor content and should not share its mutation paths.
- **Give `Workspace` the state.** Rejected for the reasons ADR-006/021/033 give: `Workspace` is zero-dependency, in-memory navigation state.
- **Store visibility as a boolean and treat "empty" separately in the component.** Rejected: it cannot distinguish "automatically hidden because empty" from "explicitly shown while empty", which the product requires.

## Consequences

- `.clutter/workspace.json` gains a `referencesDisplay` key; `mergeAndWriteWorkspaceStateFile` keeps it and the other owners' keys from clobbering one another.
- The preference is per-vault and stays with the vault, not the `.md` file: a note copied outside Clutter loses it. Intended.
- `References` gains a `showWhenEmpty` prop: with no lists it renders the `0 References` header (and no body) instead of `null`. Its default stays `null`, so the automatic behavior is unchanged.
- No change to `getPageReferences`, the knowledge graph, navigation, frontmatter or the Persistence Gate.

## Compliance checklist (architecture-compliance-checklist.md)

| Section | Result |
|---|---|
| Dependency | No upward imports. The UI receives the store as `application.referencesDisplayStore` (a field read, as for `tagExpansionStore`) and passes plain values/callbacks down; it does not construct it. |
| Ownership | One owner of the capability (`ReferencesDisplayStore`). No second implementation of a `PageOperations`/`FolderOperations` capability. New abstraction justified by ADR-033's extension point and this ADR; nothing existing fits (see Alternatives). |
| Persistence | No `writeFile`/`deleteFile`/`moveFile` of Vault content; no `Vault` mutation; no new `PersistenceOperation`; the only write is `.clutter/workspace.json` via `mergeAndWriteWorkspaceStateFile` (rule 2 Scope note). |
| Application layer | No facade forwarding method, no business policy in the Gate, no stub wired to a live control (the action has a real handler). |
| UI | No service construction in components; no concrete application/vault import into `features/`/`app/` beyond the existing `application` prop. No unhandled menu item: the handler is registered under the action id (ADR-048 guard). |
| Domain | No new projection, no path manipulation, `Vault` untouched. |
| Composition Root | Constructed exactly once in `Application.bootstrap()`; no conditional logic added. |
| Testing | Store unit tests (defaults, tolerant load, independence, sibling-key preservation, `clear`); menu-builder tests (placement/separators, label, draft, archived, sidebar omission, handler guard); component and integration tests for the validation scenarios. The "must be YES" Gate and Vault-mutation items do not apply (no Gate or Vault change). |
| Migration | No old/new pattern coexisting; nothing marked temporary; the specification is amended here, with an ADR, not silently. |
