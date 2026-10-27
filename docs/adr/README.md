# Architecture Decision Records

These record why the target architecture (`docs/architecture-target.md`, frozen in `docs/architecture-specification.md`) made the specific calls it did, for the decisions future contributors are most likely to question or want to relitigate. Each ADR is either **Accepted** (binding — changing it requires a new ADR that supersedes it, not a PR that quietly drifts) or, if one is ever superseded, marked **Superseded by ADR-XXX**.

| ADR | Title | Status |
|---|---|---|
| [001](./001-single-persistence-gate.md) | One Persistence Gate for all page/folder writes | Accepted |
| [002](./002-capability-facades.md) | Capability facades (`PageOperations`/`FolderOperations`) replace the fragmented service layer | Accepted |
| [003](./003-vault-authoritative-model.md) | Vault as the sole authoritative in-memory domain model | Accepted |
| [004](./004-lazy-projections.md) | Lazy evaluation for speculative projections instead of deletion | Accepted |
| [005](./005-navigation-router-scope.md) | Navigation Router scoped to view-level intent only | Accepted |
| [006](./006-workspace-separation.md) | Workspace kept as a separate, non-persisted navigation-state subsystem | Accepted |
| [007](./007-platform-abstraction-scope.md) | Platform abstraction kept minimal — no premature multi-backend design | Accepted |
| [008](./008-composition-root-two-phase.md) | Two-phase Composition Root construction (`bootstrap` / `attachVault`) | Accepted |
| [009](./009-delete-orphaned-packages.md) | Delete orphaned `packages/engine` and `packages/editor` rather than integrate | Accepted |
| [010](./010-retain-document-editing-engine.md) | Retain `DocumentEditing` (formerly `core/engine`) unshrunk as an internal collaborator | Accepted |
| [011](./011-phase1-persistence-gate-rescoping.md) | Phase 1 rescoped to build create/delete fresh, not migrate them | Accepted |
| [012](./012-phase2-application-layer-consolidation.md) | Phase 2 application-layer consolidation — scope and divergence record | Accepted |
| [013](./013-phase3-move-backend-and-presentational-dedup.md) | Phase 3 — Move backend/UI split, Restore/Delete UI, presentational dedup — scope and divergence record | Accepted |
| [014](./014-phase4-composition-root-and-navigation-cleanup.md) | Phase 4 — Composition root and navigation cleanup, including a Startup-sequence spec amendment | Accepted |
| [015](./015-phase5-ingest-merge-and-vaultpath.md) | Phase 5 — Ingest merge, Gate relocation, VaultPath extraction, and a folder-org self-contradiction fix | Accepted |
| [016](./016-phase6-cleanup-and-migration-close.md) | Phase 6 — Cleanup and closing the six-phase migration plan (substantially, not entirely, complete) | Accepted |
| [017](./017-draft-page-lifecycle.md) | Draft page lifecycle — unpersisted `PageOperations` sessions, no `Vault`/`PageStatus` change | Accepted |
| [018](./018-document-editing-identity-decoupling.md) | Decouple `DocumentEditing` from `Page` — identity-free editing sessions | Accepted |
| [019](./019-retire-boot-time-daily-note-scaffolding.md) | Retire `ensureDirectoryForToday` — Composition Root no longer scaffolds Daily Notes at boot | Accepted |
| [020](./020-effective-page-state-projection.md) | Effective Page State — a reconciled read projection over `Vault` and `DocumentEditing` | Accepted |
| [021](./021-ui-chrome-state.md) | UI Chrome State — extend `Workspace` for discrete navigation-shaped toggles; layout geometry stays local | Accepted |
| [022](./022-workspace-favorites-active-view.md) | Workspace/Favorites as Active-View Variants, Not Folders | Accepted |
| [023](./023-membership-selector-layer.md) | Membership Selector — the missing read-side classification layer | Accepted |
| [024](./024-folder-aggregate-lifecycle.md) | Complete the Folder Aggregate Lifecycle — Delete, Rename, Move, and Their Sync Counterparts | Proposed |
| [025](./025-fallback-page-on-delete.md) | Fallback Page — deleting the active page must never leave the app without one | Accepted |
| [030](./030-lazy-reserved-resource-materialization.md) | Reserved/system resources are lazily materialized — generalizing ADR-019 beyond Daily Notes | Accepted |
| [033](./033-fold-state-persistence.md) | Fold-state persistence — `.clutter/workspace.json`'s first real reader/writer | Accepted |
| [034](./034-table-architecture-html-projection-active-cell-editor.md) | Table rendering — real HTML `<table>` projection + one reusable active-cell CodeMirror 6 editor | Accepted |
| [035](./035-persist-workspace-session-state.md) | Persist workspace session state — `WorkspaceSessionStore` observes `Workspace` | Accepted |
| [036](./036-frontmatter-properties-aliases-and-custom-keys.md) | Frontmatter Properties — owned `aliases`, derived custom properties, and `renameCustomProperty()` | Accepted |
| [037](./037-single-global-draft.md) | One global draft — `PageOperations` holds at most one unsaved draft | Accepted |
| [038](./038-resource-filesystem-metadata.md) | Resource filesystem metadata — `VaultResource.metadata`, read once by Ingest/Sync via `VaultFileSystem.stat` | Accepted |
| [039](./039-asset-catalog.md) | The Assets catalog — every asset Clutter knows about or uses, derived from vault files and page/folder references | Accepted |
| [040](./040-caller-triggered-reconciliation-for-app-created-files.md) | Caller-triggered reconciliation (`reconcileKnownPath`) for files the app creates outside the Gate | Accepted |
| [041](./041-template-marker-reconciliation.md) | The Templates folder is the source of truth for template status — Sync reconciles the `kind: template` marker | Accepted |
| [042](./042-trashed-daily-note-identity-and-restore-conflict.md) | A trashed Daily Note keeps its identity; a restore that finds its day taken asks instead of failing | Accepted |
| [043](./043-sync-never-trusts-a-paired-rename-destination.md) | Sync never trusts a paired rename's destination — an external delete must not become a move onto an unrelated path | Accepted |
| [044](./044-task-due-date-is-explicit-never-implied-by-its-note.md) | A task's due date is explicit — never implied by the Daily Note it lives in; New Task always lands in today's note | Accepted |
| [045](./045-all-tasks-is-a-configurable-collection.md) | All Tasks is a configurable collection — it plugs into the shared collection settings (definition, registry properties, store key, List/Table) | Accepted |
| [046](./046-task-views-are-datasets-of-one-task-collection.md) | Task views are datasets of one Task Collection — one config key, one `tasksForView` membership authority, one renderer | Accepted |
| [047](./047-tag-restyle-is-a-casing-only-one-time-operation.md) | `TagOperations.restyle()` — a casing-only, one-time Tag operation (not a setting) | Accepted |
| [048](./048-canonical-resource-actions.md) | Canonical resource actions — one definition per resource; groups, order and dividers derived; surface visibility explicit | Accepted |
| [049](./049-move-zones.md) | Move zones — Templates and Assets are sealed hierarchies; a Template stays in Templates, an Asset in Assets | Accepted |
| [050](./050-remove-unreachable-task-views.md) | Remove the unreachable Today / Overdue / Upcoming / Completed task views (amends ADR-046 and ADR-027); the sidebar sections stay | Accepted |
| [051](./051-tasks-page-tabs-select-the-dataset.md) | The Tasks page tabs select the dataset — Today / Upcoming return as tab datasets (page-local state), not as navigation views | Accepted |
| [052](./052-references-display-preferences.md) | Per-note References display preferences (visibility tri-state + expansion) persist in `.clutter/workspace.json` via `ReferencesDisplayStore` — not frontmatter, not the Gate | Accepted |
| [053](./053-persistent-parsed-note-cache.md) | A persistent parsed-note cache — a content-addressed memo of `FrontmatterParser.parse`, stored in the application cache directory via native commands; validated by content hash + parser fingerprint, never timestamps; structural equivalence with uncached ingestion is an acceptance criterion | Accepted |
| [054](./054-cover-credit-for-unsplash-covers.md) | `coverCredit` — a cover's Unsplash photographer credit travels with the cover as one owned frontmatter key (`Name <profile-url>`); set/cleared with `cover` in one patch; legacy covers get a "by Unsplash" fallback; explicit Download / Save to vault of an Unsplash photo is allowed and reported to Unsplash (download_location kept in the credit) | Accepted |
| [055](./055-manual-sidebar-order.md) | Manual sidebar order — a `manual` sidebar sort and `sidebarOrder` (kind-prefixed ids, per parent, root under `sidebar:root`) in `CollectionViewConfigStore`; presentation state outside the Gate; moves unchanged and unaware; order written only after a needed move succeeds | Accepted |
| [056](./056-spaces-are-application-level-and-switching-reopens-the-application.md) | Spaces are application-level — a registry (`paths` + `activePath`) outside every Space, persisted after a Space opens; switching closes the one `Application` and bootstraps a new one for the new root; folders are probed read-only first and a failed switch returns to the previous Space | Accepted |
| [057](./057-filesystem-first-created-and-last-edited.md) | Created / Last edited are the file's own birth/mtime — `Page.fileTimes`, one pure resolver, never serialized, no frontmatter fallback; `PageMetadata` carries no date | Accepted |
| [058](./058-properties-are-declared-by-frontmatter-keys.md) | Properties are declared by their frontmatter keys — `created: true` / `modified: true` declare the date rows, `showProperties` replaces `properties.visible` / `properties.show`; clean break, no legacy reader | Accepted |
| [059](./059-empty-daily-note-draft-is-temporary.md) | An empty Daily Note draft is temporary — `discardAbandonedDraft` no longer keeps it alive because Back/Forward history references it (`Workspace.isReferencedInHistory` removed); stale history entries are skipped by `NavigationRouter.stillExists`; today's retention and contentful drafts unchanged; amends ADR-037's "unchanged" list | Accepted |
| [060](./060-show-references-automatically-setting.md) | "Show references automatically" — an app-wide setting (default on, localStorage) feeding `isReferencesDisplayed(saved, { enabled, count })`: a saved Show/Hide always wins; with no saved choice the section shows when the setting is on and the page has a reference; `ReferencesDisplayStore` and the top-bar toggle unchanged; amends ADR-053's hidden-by-default | Accepted |
| [061](./061-search-is-a-read-only-in-memory-scan-in-the-application-layer.md) | Search is a read-only in-memory scan owned by the Application layer — `SearchService` reads Vault pages overlaid with open sessions/drafts/live titles; one relevance score (location baselines far apart: exact title → close title → alias → heading/body phrase → nearby words → tags/weak body; recency ≤ 5 points); typo tolerance (one edit) for titles and aliases only; visible-text matching with exact source-offset maps; resumable sliced jobs with show-more; no index, no write path; adds `PageOperations.getLiveTitle`; Search is an overlay, not a sidebar tab | Accepted |
| [062](./062-crash-recovery-snapshots.md) | Crash recovery — session-tagged snapshots of unsaved work (body, title, description, drafts) written outside the vault in the app data directory; revision-aware cleanup; startup review that never overwrites (recoverable / conflict / missing / draft → restore, save as new note, discard) |
