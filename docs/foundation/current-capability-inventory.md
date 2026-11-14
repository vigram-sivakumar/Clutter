# Current capability inventory — R01

Audit date: 2026-11-14. Scope: checked-out `architecture/clutter-foundation` at
`f22a5cd182c171ae9bfaf22f7ac320019fb9a4ec`, including product source inherited from
main `cae6042`. Remote branch was fetched and fast-forwarded only after its files
were confirmed identical to the previously delivered 0.3 documents. No production
files or old documents were edited. Findings do not describe unmerged spike branches.

## What is established

This is a source/wiring and selected-test capability audit, not a line-by-line
correctness/security audit or a live macOS acceptance run. A passing test proves
its existing fixture assertions, not every future contract in that row. Negative
findings mean not located within the named bounded search; they are not assertions
that a string search proves a feature impossible or absent from all branches.

**Keep** preserves a product capability/guarantee, not sunk implementation investment.
**Redesign** identifies changed semantics/ownership or a new required capability.
**Retire** is limited to a positively superseded old behaviour. **Unresolved** means
release/behaviour detail needs an explicit specification, not automatic removal.
Technology and effort remain separate from product decisions; effort has zero
selection weight. Proposed owners name responsibilities, not mandated service classes.

## Selected executed evidence

[Machine-readable run record](evidence/r01-2026-11-14.json): **30 selected files
executed successfully, 1,003 assertions passed**, across the initial run and targeted
reruns. This is not a full repository run or native input qualification, and the
whole selection was not rerun together under a single corrected configuration.

The initial invocation exited **1**: 28 files/965 assertions passed, two files
could not load. The follow-up two-file run also exited 1 while resolving the last
load error; the final single-file rerun exited 0. The exact sequence is retained:

- `PageHost.editTask.test.tsx`: initially unresolved workspace-local plugin-http;
  exposed the actual installed 2.7.0 dependency matching the workspace lock entry;
  targeted rerun passed **8** assertions.
- `tableLiveWiring.test.ts`: initially PDF worker URL denied through shared dependency
  path; a temporary external config only extended allowed dependency paths;
  targeted rerun passed **30** assertions.

Existing dependencies were reused with matching lockfile bytes; this was not a
fresh clean install. No application source, test mocks or checked-in Vite config
changed. Temporary dependency links were removed. Other located tests below were
not run. A fresh complete dependency installation should reproduce without the
sibling-worktree allowance; that has not been verified here.

The registered source, facade or UI handler establishes wiring where noted;
comments/old design notes are not substituted for those paths. Counts and per-file
results are preserved so a different AI can reproduce this bounded run.

## Content, organisation and property capabilities

### C01: Notes and drafts

**Observed:** PageOperations opens/drafts/mutates/saves notes; PageType is note or daily-note. The page UI wires editor changes to these operations.

**Source:** [PageOperations.ts](../../apps/app/src/core/application/page/PageOperations.ts); [Page.ts](../../apps/app/src/core/vault/models/Page.ts); [PageHost.tsx](../../apps/app/src/app/layouts/page/PageHost.tsx).

**Tests:** [PageOperations.draftLifecycle.test.ts](../../apps/app/src/core/application/page/PageOperations.draftLifecycle.test.ts) — **17 passed**.

**Target:** Keep the note/draft capability; redesign target coordination and representation without requiring implementation reuse. Requirements: P-01, P-02, P-06, P-07. Proposed owner: Space operations and document sessions.

**Next validation:** R03/R04: specify draft promotion, content/metadata transaction and last-view lifetime; do not promote transient draft navigation into canonical notes.

### C02: Daily notes

**Observed:** DailyNoteService ensures the year/month folders at persistence time. Opening by date can create an unsaved draft; startup does not imply eagerly saved daily notes.

**Source:** [DailyNoteService.ts](../../apps/app/src/core/application/daily-notes/DailyNoteService.ts); [DailyNotePath.ts](../../apps/app/src/core/vault/ingest/DailyNotePath.ts); [PageOperations.ts](../../apps/app/src/core/application/page/PageOperations.ts).

**Tests:** [DailyNoteService.test.ts](../../apps/app/src/core/application/daily-notes/DailyNoteService.test.ts) — located, not run; [PageOperations.draftLifecycle.test.ts](../../apps/app/src/core/application/page/PageOperations.draftLifecycle.test.ts) — **17 passed**.

**Target:** Keep date-based note UX; path layout is not a target constraint. Requirements: P-01, P-13, P-31. Proposed owner: Daily-note policy over shared document commands.

**Next validation:** R03: identity/date/time-zone rules, duplicate daily notes and template defaults independent of paths.

### C03: Templates

**Observed:** Application helpers copy/merge body and selected metadata/custom property blocks; existing values have merge rules and undo metadata support. Preferred/usage stores support selection, not ongoing document inheritance.

**Source:** [applyTemplateToNote.ts](../../apps/app/src/features/notes/helpers/applyTemplateToNote.ts); [createNoteFromTemplate.ts](../../apps/app/src/features/notes/helpers/createNoteFromTemplate.ts); [PreferredTemplatesStore.ts](../../apps/app/src/core/application/templates/PreferredTemplatesStore.ts).

**Tests:** [applyTemplateToNote.integration.test.ts](../../apps/app/src/features/notes/helpers/applyTemplateToNote.integration.test.ts) — **23 passed**.

**Target:** Keep one-time application; redesign identity-bearing copy for task/block entities. Requirements: P-01, P-25, P-29. Proposed owner: Template command using entity copy policy.

**Next validation:** R03: freeze merge-versus-replace details and new IDs; do not mistake template usage bookkeeping for a live inheritance relationship.

### C04: Custom and system properties

**Observed:** The property UI builds system/custom rows. Custom properties derive from preserved frontmatter lines, including number/date/url typed-empty hints, booleans and lists. UI type vocabulary includes multi-select; this is not a global user schema.

**Source:** [customFrontmatter.ts](../../apps/app/src/core/vault/ingest/frontmatter/customFrontmatter.ts); [Property.types.ts](../../apps/app/src/core/properties/Property.types.ts); [buildPageProperties.ts](../../apps/app/src/app/layouts/page/buildPageProperties.ts).

**Tests:** [customFrontmatter.test.ts](../../apps/app/src/core/vault/ingest/frontmatter/customFrontmatter.test.ts) — **127 passed**.

**Target:** Keep independent typed custom properties; redesign storage/schema under D-02. Requirements: P-22, P-25. Proposed owner: Entity property model and shared validation.

**Next validation:** R03: specify types, empty/null/remove semantics and selectable-option definition. Existing list syntax alone does not prove the complete target option model.

### C05: Folders, moves and references

**Observed:** FolderOperations and the persistence gate implement create/rename/move/archive/restore; page/folder rewrites and archive membership are handled by dedicated policies.

**Source:** [FolderOperations.ts](../../apps/app/src/core/application/folder/FolderOperations.ts); [PagePersistenceCoordinator.ts](../../apps/app/src/core/vault/persistence/PagePersistenceCoordinator.ts); [MembershipSelector.ts](../../apps/app/src/core/application/membership/MembershipSelector.ts).

**Tests:** [FolderOperations.test.ts](../../apps/app/src/core/application/folder/FolderOperations.test.ts) — **116 passed**; [PageOperations.archiveRestore.test.ts](../../apps/app/src/core/application/page/PageOperations.archiveRestore.test.ts) — **38 passed**.

**Target:** Keep organisation/lifecycle; redesign physical layout and cross-entity transactions as needed. Requirements: P-01, P-12, P-13. Proposed owner: Space organisation operations.

**Next validation:** R03/R04: define logical folders, owned task cascades and restore collisions; filesystem directory preservation is current behaviour, not mandatory target storage.

### C06: Identity and duplicate IDs

**Observed:** IdentityResolver prefers persisted frontmatter IDs, falls back to path, and always derives binary-resource identity from path. Duplicate-ID repair gives copied page/folder discoveries new IDs. These mechanisms do not establish stable block/task IDs.

**Source:** [IdentityResolver.ts](../../apps/app/src/core/vault/ingest/identity/IdentityResolver.ts); [resolveDuplicateId.ts](../../apps/app/src/core/vault/ingest/identity/resolveDuplicateId.ts); [PageBuilder.ts](../../apps/app/src/core/vault/ingest/PageBuilder.ts).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Redesign identity completeness; retain rename/copy guarantees. Requirements: P-01, P-22, P-26, P-27. Proposed owner: Canonical identity and copy/move rules.

**Next validation:** R03: stable IDs, scope, copy provenance, provider tombstones, restore-after-move and asset references.

### C07: Predefined collection views

**Observed:** Collection definitions choose fixed registered fields/layouts/actions. Table/list/card configuration is persisted as user overrides. Arbitrary custom note property names are not a collection schema here.

**Source:** [collectionDefinitions.ts](../../apps/app/src/core/presentation/collection/collectionDefinitions.ts); [collectionProperties.ts](../../apps/app/src/core/properties/collectionProperties.ts); [CollectionViewConfigStore.ts](../../apps/app/src/core/application/collection/CollectionViewConfigStore.ts).

**Tests:** [collectionDefinitions.test.ts](../../apps/app/src/core/presentation/collection/collectionDefinitions.test.ts) — **36 passed**; [CollectionViewConfigStore.perView.test.ts](../../apps/app/src/core/application/collection/CollectionViewConfigStore.perView.test.ts) — **12 passed**.

**Target:** Keep predefined-field views; do not add the withdrawn database-style proposal. Requirements: P-11, P-25. Proposed owner: Shared predefined view registry and derived queries.

**Next validation:** R03/UI spec: task field vocabulary/defaults and supported layouts; no silent note-property creation.

### C08: Feature-gated capability availability

**Observed:** Daily-notes collection pages, moving-assets setting visibility and remote-asset catalog listing have false default flags. Atomic writes default true. PageHost checks the daily-note collection flag. Implemented code must not be counted automatically as exposed UI.

**Source:** [featureFlags.ts](../../apps/app/src/core/featureFlags.ts); [PageHost.tsx](../../apps/app/src/app/layouts/page/PageHost.tsx).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Unresolved release scope for gated presentation; retain explicit policy ownership. Requirements: P-11, P-13, P-34. Proposed owner: Feature capability policy and view composition.

**Next validation:** R01 follow-through/R03: distinguish implemented, default-visible and target-approved for each gated feature; user did not approve dropping them.

## Tasks, dates and scheduler gaps

### C09: Current task representation and mutation

**Observed:** Tasks are extracted occurrences carrying sourcePageId, offsets/rawText, completed state and optional dueDate/dueTime/completedAt. TaskOperations locates and rewrites source lines; ambiguous stale duplicates reject. There is no durable TaskId field in this shape.

**Source:** [TaskOccurrence.ts](../../apps/app/src/core/vault/models/occurrences/TaskOccurrence.ts); [TaskExtractor.ts](../../apps/app/src/core/vault/ingest/extractors/TaskExtractor.ts); [TaskOperations.ts](../../apps/app/src/core/application/task/TaskOperations.ts).

**Tests:** [TaskOperations.test.ts](../../apps/app/src/core/application/task/TaskOperations.test.ts) — **67 passed**.

**Target:** Redesign as identity-bearing tasks with one content owner/location; preserve guarded mutation safety. Requirements: P-01, P-26, P-27. Proposed owner: Task entity operations and canonical placement policy.

**Next validation:** R03: task entity/body/history schema; stale offsets are not the new identity contract.

### C10: New task destination

**Observed:** The shared helper used by sidebar/All Tasks ensures today's daily note, adds a task and requests save. Its due date does not select the destination.

**Source:** [createTaskInDailyNote.ts](../../apps/app/src/features/tasks/helpers/createTaskInDailyNote.ts); [PageHost.tsx](../../apps/app/src/app/layouts/page/PageHost.tsx).

**Tests:** [createTaskInDailyNote.test.ts](../../apps/app/src/features/tasks/helpers/createTaskInDailyNote.test.ts) — **5 passed**.

**Target:** Retire automatic daily-note routing for global task creation; replace with independent task inbox. Requirements: P-26. Proposed owner: Shared task creation command.

**Next validation:** R03: inbox lifecycle and later cut/paste placement; this is an intentional target change, not a current defect.

### C11: Task opening and editing UI

**Observed:** TasksCollectionBody creates row keys from source page plus offset/text and exposes open-in-note/edit actions; PageHost opens task.sourcePageId and wires EditTaskDialog. Opening a task today is not opening a distinct task page.

**Source:** [TasksCollectionBody.tsx](../../apps/app/src/features/tasks/page/TasksCollectionBody.tsx); [EditTaskDialog.tsx](../../apps/app/src/features/tasks/shortcuts/EditTaskDialog.tsx); [PageHost.tsx](../../apps/app/src/app/layouts/page/PageHost.tsx).

**Tests:** [PageHost.editTask.test.tsx](../../apps/app/src/app/layouts/page/PageHost.editTask.test.tsx) — **8 passed on targeted rerun**.

**Target:** Redesign navigation/editing destination as task page; keep one shared entity. Requirements: P-01, P-14, P-26. Proposed owner: Task page route, task command API and editor adapter.

**Next validation:** R03: independent/in-note task page loading, titles/body/properties and deletion/restore. The targeted UI fixture now passes, but does not implement or qualify the target task-page model.

### C12: Task datasets and archive visibility

**Observed:** Tasks use shared dataset helpers/grouping. Vault.tasks() excludes template/archived sources; EffectivePageState.getTasks() overlays live sessions/drafts. Task due dates are explicit, not inherited from daily-note location.

**Source:** [tasksForView.ts](../../apps/app/src/features/tasks/helpers/tasksForView.ts); [groupTasks.ts](../../apps/app/src/features/tasks/helpers/groupTasks.ts); [Vault.ts](../../apps/app/src/core/vault/models/Vault.ts); [EffectivePageState.ts](../../apps/app/src/core/application/page/EffectivePageState.ts); [TaskBuilder.ts](../../apps/app/src/core/vault/knowledge/TaskBuilder.ts).

**Tests:** [tasksForView.test.ts](../../apps/app/src/features/tasks/helpers/tasksForView.test.ts) — **11 passed**; [MembershipSelector.test.ts](../../apps/app/src/core/application/membership/MembershipSelector.test.ts) — **75 passed**.

**Target:** Keep derived task views and archive exclusion; redesign inputs for task entities. Requirements: P-11, P-13, P-26, P-32. Proposed owner: Task query/membership policy.

**Next validation:** R03: inbox versus Unscheduled distinction, scheduled versus deadline datasets and active/history visibility. Sidebar currently calls EffectivePageState.getTasks(), while PageHost passes vault.tasks() into the task collection; align freshness under P-11. This is a source-level divergence risk, not a reproduced UI failure.

### C13: Schedule versus deadline

**Observed:** TaskOccurrence has one dueDate/dueTime pair and TaskOperations patches date metadata. A stored local time is not a second scheduled-date field. No separately modelled schedule/deadline pair is established by these sources.

**Source:** [TaskOccurrence.ts](../../apps/app/src/core/vault/models/occurrences/TaskOccurrence.ts); [TaskOperations.ts](../../apps/app/src/core/application/task/TaskOperations.ts); [dateReference.ts](../../apps/app/src/shared/helpers/time/dateReference.ts).

**Tests:** [TaskOperations.test.ts](../../apps/app/src/core/application/task/TaskOperations.test.ts) — **67 passed**.

**Target:** Redesign temporal task fields as agreed. Requirements: P-26, P-31. Proposed owner: Shared temporal/task schema.

**Next validation:** R03/R06: due/deadline naming, date-only/time-zone values, ordering and overdue calculations.

### C14: Recurrence and reminders

**Observed:** TaskExtractor recognises due/completed metadata only; repeat/reminder are TODO/unrecognised text. DatePicker supplies date selection and optional footer actions, not a reminder scheduler. Bounded searches found no target recurrence/notification pipeline.

**Source:** [TaskExtractor.ts](../../apps/app/src/core/vault/ingest/extractors/TaskExtractor.ts); [DatePicker.tsx](../../apps/app/src/components/date-picker/DatePicker.tsx); [TaskOccurrence.ts](../../apps/app/src/core/vault/models/occurrences/TaskOccurrence.ts).

**Tests:** [DatePicker.test.tsx](../../apps/app/src/components/date-picker/DatePicker.test.tsx) — located, not run.

**Target:** Redesign/new capability; preserve original-schedule, completion-gated, skip-missed, empty-next-body contract. Requirements: P-28, P-31, P-32. Proposed owner: Scheduler/occurrence policy, platform notification adapter.

**Next validation:** R03/R06: series/occurrence IDs, retry-safe completion, date-picker reminder toggle and multi-device/archive eligibility; T-19 remains pending.

### C15: Task move, copy and indentation

**Observed:** Current task duplicate/delete work on Markdown source lines. Editor indentation is structural text editing, not persistent task ownership. This does not demonstrate ID/history-preserving task cut/paste, nor independent task page duplication.

**Source:** [TaskOperations.ts](../../apps/app/src/core/application/task/TaskOperations.ts); [markdownIndentKeymap.ts](../../apps/app/src/features/markdown/editor/codemirror/indent/markdownIndentKeymap.ts).

**Tests:** [TaskOperations.test.ts](../../apps/app/src/core/application/task/TaskOperations.test.ts) — **67 passed**; [markdownIndentKeymap.test.ts](../../apps/app/src/features/markdown/editor/codemirror/indent/markdownIndentKeymap.test.ts) — located, not run.

**Target:** Redesign semantic task clipboard/moves; no subtasks. Requirements: P-01, P-26, P-27, P-28. Proposed owner: Clipboard intent plus task placement/copy commands.

**Next validation:** R02/R03: typed internal clipboard, cut lifecycle, source disappearance, cross-process/device paste and restore collisions. Visually nested tasks remain independent.

### C16: Date mention insertion and display

**Observed:** Date-expression resolution accepts relative input; dateReference stores a fixed ISO date with optional local wall-clock time and formats display separately. That foundation does not implement reminder delivery or midnight rescheduling.

**Source:** [dateExpressions.ts](../../apps/app/src/features/markdown/editor/codemirror/date/dateExpressions.ts); [dateReference.ts](../../apps/app/src/shared/helpers/time/dateReference.ts); [dateDisplay.ts](../../apps/app/src/shared/helpers/time/dateDisplay.ts).

**Tests:** [dateExpressions.test.ts](../../apps/app/src/features/markdown/editor/codemirror/date/dateExpressions.test.ts) — **32 passed**; [dateReference.test.ts](../../apps/app/src/shared/helpers/time/dateReference.test.ts) — located, not run.

**Target:** Keep fixed-date/relative-label concept; specify notification and time-zone behaviour separately. Requirements: P-31, P-32. Proposed owner: Shared date semantics and platform-neutral scheduler.

**Next validation:** R02/R06: midnight refresh, DST/time-zone changes, fixed versus relative display and no notification without toggle.

## Navigation, input, selection and undo

### C17: Navigation and workspace lifetime

**Observed:** Workspace owns one active destination plus open IDs and back/forward state; NavigationRouter opens valid targets. Comments mentioning six task pages are broader than the live FilteredView union.

**Source:** [Workspace.ts](../../apps/app/src/core/workspace/Workspace.ts); [NavigationRouter.ts](../../apps/app/src/core/application/navigation/NavigationRouter.ts).

**Tests:** [Workspace.test.ts](../../apps/app/src/core/workspace/Workspace.test.ts) — **42 passed**.

**Target:** Keep independent navigation UX; redesign window/pane/tab ownership. Requirements: P-04, P-14, P-15. Proposed owner: Window/pane/tab navigation owners.

**Next validation:** R02/R03: destination IDs, per-tab history, focus routing and missing-target restore.

### C18: Multiple windows and split views

**Observed:** Application constructs its own Workspace/DocumentRegistry; app_menu has a main-window label and explicitly no New Window action. No tab/pane/window document-sharing topology is wired in this branch. Sidebar tabs and TasksTabs are dataset switches, not document tabs.

**Source:** [Application.ts](../../apps/app/src/core/application/Application.ts); [DocumentRegistry.ts](../../apps/app/src/core/engine/DocumentRegistry.ts); [app_menu.rs](../../apps/app/src-tauri/src/app_menu.rs); [TasksTabs.tsx](../../apps/app/src/features/tasks/page/TasksTabs.tsx).

**Tests:** [DocumentRegistry.test.ts](../../apps/app/src/core/engine/DocumentRegistry.test.ts) — **8 passed**.

**Target:** Redesign/new shared authority, views and focused command routing. Requirements: P-02, P-04, P-14, P-16. Proposed owner: Application coordinator and local headless Space authority.

**Next validation:** R03/R06: IPC/election/focus; T-02/T-07 must execute later. Earlier work on other spike branches is not production evidence for this revision.

### C19: Preferences and layout persistence

**Observed:** Space registry is a localStorage path-based collection; workspaceSession lives in the Space workspace file. Separate preference helpers and SpaceProfileStore expose global/Space configuration, but that does not establish coordinated multi-window writers.

**Source:** [spaceRegistry.ts](../../apps/app/src/app/spaces/spaceRegistry.ts); [WorkspaceSessionStore.ts](../../apps/app/src/core/application/workspace/WorkspaceSessionStore.ts); [SpaceProfileStore.ts](../../apps/app/src/core/application/space/SpaceProfileStore.ts); [useSettingsSources.ts](../../apps/app/src/app/layouts/sidebar/useSettingsSources.ts).

**Tests:** [WorkspaceSessionStore.test.ts](../../apps/app/src/core/application/workspace/WorkspaceSessionStore.test.ts) — **35 passed**; [spaceRegistry.test.ts](../../apps/app/src/app/spaces/spaceRegistry.test.ts) — located, not run.

**Target:** Keep settings/restore UX; redesign precise owners and storage scopes. Requirements: P-01, P-08, P-15, P-16. Proposed owner: Application preferences, Space configuration and per-window layout owners.

**Next validation:** R03/R06: prevent replicated layout from replacing another device/window state; stable Space identity is separate from mutable path.

### C20: Live document and saved-state overlay

**Observed:** DocumentSession carries live/saved revisions. EffectivePageState overlays sessions/drafts on Vault data; SearchService also overlays live content. These are explicit durability stages/projections, not by themselves evidence of accidental duplicate authority.

**Source:** [DocumentSession.ts](../../apps/app/src/core/engine/DocumentSession.ts); [EffectivePageState.ts](../../apps/app/src/core/application/page/EffectivePageState.ts); [SearchService.ts](../../apps/app/src/core/application/search/SearchService.ts).

**Tests:** [DocumentSession.test.ts](../../apps/app/src/core/engine/DocumentSession.test.ts) — **11 passed**; [EffectivePageState.test.ts](../../apps/app/src/core/application/page/EffectivePageState.test.ts) — **24 passed**.

**Target:** Keep live read consistency; redesign per-Space/process ownership. Requirements: P-04, P-06, P-08, P-11. Proposed owner: Document session authority and revision-tagged read models.

**Next validation:** R03/R04: ordering, subscriber catch-up, pending mutations and session eviction independent of views.

### C21: CM6 core input and custom keyboard composition

**Observed:** createEditorView installs CM6 history/keymaps and drawSelection; buildEditorExtensions adds custom enter/indent/list/deletion and selection/widget behaviour. CM6 does not eliminate Clutter-authored interaction policy.

**Source:** [createEditorView.ts](../../apps/app/src/features/markdown/editor/codemirror/createEditorView.ts); [buildEditorExtensions.ts](../../apps/app/src/features/markdown/editor/codemirror/buildEditorExtensions.ts); [markdownEnterKeymap.ts](../../apps/app/src/features/markdown/editor/codemirror/enter/markdownEnterKeymap.ts); [markdownIndentKeymap.ts](../../apps/app/src/features/markdown/editor/codemirror/indent/markdownIndentKeymap.ts).

**Tests:** [createEditorView.test.ts](../../apps/app/src/features/markdown/editor/codemirror/createEditorView.test.ts) — **45 passed**; [markdownEnterKeymap.test.ts](../../apps/app/src/features/markdown/editor/codemirror/enter/markdownEnterKeymap.test.ts) — located, not run.

**Target:** Keep dependable native behaviour as gate; editor technology unresolved. Requirements: P-03, P-05, P-23. Proposed owner: Editor adapter and explicit shared interaction contracts.

**Next validation:** R02: exact platform/modifier/selection matrix. Node/jsdom state tests cannot settle WKWebView selection reliability.

### C22: Interactive history cache

**Observed:** MarkdownEditor captures/restores in-memory history/selection/scroll; the cache is keyed by page ID and restore is gated by document equality. It is not durable user version history and not a demonstrated multi-context undo authority.

**Source:** [MarkdownEditor.tsx](../../apps/app/src/features/markdown/editor/MarkdownEditor.tsx); [editorHistoryCache.ts](../../apps/app/src/features/markdown/editor/codemirror/editorHistoryCache.ts); [createEditorView.ts](../../apps/app/src/features/markdown/editor/codemirror/createEditorView.ts).

**Tests:** [createEditorView.test.ts](../../apps/app/src/features/markdown/editor/codemirror/createEditorView.test.ts) — **45 passed**.

**Target:** Keep tab-switch history guarantee; redesign context-local metadata and remote-replace boundary. Requirements: P-05, P-17. Proposed owner: Editing context history and mapped accepted operations.

**Next validation:** R02/R03: same document in two views, external edits and overlap/dependency inverses; do not reuse a page-ID-only cache as a multi-view solution.

### C23: Tables and nested cell editing

**Observed:** buildEditorExtensions installs the real table widget and reconciliation/navigation. TableActiveCellController uses one reusable nested editor, disables its own history and forwards undo/redo to the root. The table subsystem is wired despite the stale old feature matrix.

**Source:** [buildEditorExtensions.ts](../../apps/app/src/features/markdown/editor/codemirror/buildEditorExtensions.ts); [tableActiveCellController.ts](../../apps/app/src/features/markdown/editor/codemirror/table/tableActiveCellController.ts); [tableWidgetField.ts](../../apps/app/src/features/markdown/editor/codemirror/table/tableWidgetField.ts).

**Tests:** [tableActiveCellController.test.ts](../../apps/app/src/features/markdown/editor/codemirror/table/tableActiveCellController.test.ts) — **35 passed**; [tableLiveWiring.test.ts](../../apps/app/src/features/markdown/editor/codemirror/table/tableLiveWiring.test.ts) — **30 passed on targeted rerun**.

**Target:** Keep table capability; redesign/qualify selection and single-history composition. Requirements: P-03, P-05, P-23. Proposed owner: Editor/table adapter with one document mutation/history boundary.

**Next validation:** R02: cell/text/row/column selection, boundary arrows, clipboard, native redo and focus. Controller and targeted live-wiring tests passed; neither is actual WKWebView input evidence.

### C24: Clipboard, drag/drop and formatting

**Observed:** Root/cell paste routing shares classification for tables/files/text; external HTML conversion and asset importing exist. This is more than plain browser paste, but does not prove future entity-aware cut/copy semantics.

**Source:** [pasteRouting.ts](../../apps/app/src/features/markdown/editor/codemirror/paste/pasteRouting.ts); [htmlToMarkdown.ts](../../apps/app/src/features/markdown/editor/codemirror/paste/htmlToMarkdown.ts); [useFileDropTarget.tsx](../../apps/app/src/shared/hooks/useFileDropTarget.tsx).

**Tests:** [MarkdownEditor.paste.fullStack.test.tsx](../../apps/app/src/features/markdown/editor/MarkdownEditor.paste.fullStack.test.tsx) — located, not run; [pasteHandlerOwnership.test.ts](../../apps/app/src/features/markdown/editor/codemirror/paste/pasteHandlerOwnership.test.ts) — located, not run.

**Target:** Keep content-safe paste/drop; redesign entity transfer. Requirements: P-03, P-10, P-27, P-34. Proposed owner: Clipboard adapter and shared import/copy commands.

**Next validation:** R02/R03: real OS clipboard/drop, task identities and one undo action; selected R01 tests do not qualify these paths.

### C25: Dialect, folding and completion

**Observed:** Editor extension composition includes wiki links, tags/dates/embeds, list/code formatting, task checkbox decorations and folding. Custom task checkbox decoration has parser-aware tests. These features must be accounted for rather than lost in an engine swap.

**Source:** [buildEditorExtensions.ts](../../apps/app/src/features/markdown/editor/codemirror/buildEditorExtensions.ts); [markdownLanguage.ts](../../apps/app/src/features/markdown/editor/codemirror/markdownLanguage.ts); [foldToggleDecoration.ts](../../apps/app/src/features/markdown/editor/codemirror/fold/foldToggleDecoration.ts).

**Tests:** [taskCheckboxDecoration.test.ts](../../apps/app/src/features/markdown/editor/codemirror/task/taskCheckboxDecoration.test.ts) — **32 passed**; [foldToggleDecoration.test.ts](../../apps/app/src/features/markdown/editor/codemirror/fold/foldToggleDecoration.test.ts) — located, not run.

**Target:** Keep supported content semantics; unresolved exact live-preview presentation per target editor. Requirements: P-03, P-10, P-22, P-23. Proposed owner: Semantic schema plus editor presentation adapters.

**Next validation:** R02/R03: enumerate custom lists/quotes/separators/code, completion/fold selection, unknown syntax and interchange losses; no implied math/diagram/drawing scope.

## References, media, queries and data lifecycle

### C26: Links and backlinks

**Observed:** KnowledgeGraphBuilder resolves page links/embeds using LinkResolver; PageOperations has reference-rewrite operations. References name page paths/aliases/headings rather than establishing stable task references.

**Source:** [KnowledgeGraphBuilder.ts](../../apps/app/src/core/vault/knowledge/KnowledgeGraphBuilder.ts); [LinkResolver.ts](../../apps/app/src/core/vault/knowledge/LinkResolver.ts); [resolveWikiLink.ts](../../apps/app/src/app/layouts/page/resolveWikiLink.ts).

**Tests:** [PageOperations.renameReferences.test.ts](../../apps/app/src/core/application/page/PageOperations.renameReferences.test.ts) — located, not run.

**Target:** Keep links/backlinks with identity-safe target model. Requirements: P-01, P-11, P-22, P-27. Proposed owner: Reference model and derived relationship queries.

**Next validation:** R03: resolved/unresolved/ambiguous targets, rename/archive/delete, block references and no cross-note task referencing.

### C27: Read-only live page embeds

**Observed:** resolvePageEmbed resolves path/alias/heading and reads EffectivePageState so content can reflect unsaved target edits. NoteEmbedWidget creates a read-only nested view rather than an independent editing body.

**Source:** [resolvePageEmbed.ts](../../apps/app/src/app/layouts/page/resolvePageEmbed.ts); [NoteEmbedWidget.ts](../../apps/app/src/features/markdown/editor/codemirror/embed/NoteEmbedWidget.ts).

**Tests:** [resolvePageEmbed.test.ts](../../apps/app/src/app/layouts/page/resolvePageEmbed.test.ts) — **20 passed**.

**Target:** Keep read-only/open-original model. Requirements: P-03, P-04, P-30. Proposed owner: Read-only document projection and reference resolver.

**Next validation:** R02/R03: cyclic/missing embeds, selection across boundaries, click to original and export. Resolver tests are not pointer/selection evidence.

### C28: Images, PDFs and assets UI

**Observed:** SupportedResourceKind classifies image/PDF files. Editor widgets/resolvers and image/PDF viewer surfaces are wired; the asset collection has previews and import paths.

**Source:** [SupportedResourceKind.ts](../../apps/app/src/core/vault/ingest/SupportedResourceKind.ts); [resolveEmbedPdf.ts](../../apps/app/src/app/layouts/page/resolveEmbedPdf.ts); [PdfViewer.tsx](../../apps/app/src/features/pdf/PdfViewer.tsx); [AssetsCollectionBody.tsx](../../apps/app/src/app/layouts/page/body/AssetsCollectionBody.tsx).

**Tests:** [resolveEmbedPdf.test.ts](../../apps/app/src/app/layouts/page/resolveEmbedPdf.test.ts) — **13 passed**; [importAssetBytes.test.ts](../../apps/app/src/core/vault/asset/importAssetBytes.test.ts) — **5 passed**.

**Target:** Keep image/PDF/media scope; redesign canonical references/lifetimes if needed. Requirements: P-03, P-12, P-34. Proposed owner: Asset model plus media render/platform services.

**Next validation:** R02/R04: missing/large/corrupt files, pagination/selection, availability and keyboard. No extension to diagrams/math/drawings is authorized.

### C29: Asset publication and identity

**Observed:** importAsset copies to a collision-free Assets filename with no-clobber retry. Resource IDs are path-derived; move/reference-rewrite policies exist. Asset import currently falls outside the page/folder gate scope by explicit rule.

**Source:** [importAsset.ts](../../apps/app/src/core/vault/asset/importAsset.ts); [IdentityResolver.ts](../../apps/app/src/core/vault/ingest/identity/IdentityResolver.ts); [rewriteMovedAssetReferences.ts](../../apps/app/src/core/application/asset/rewriteMovedAssetReferences.ts).

**Tests:** [importAssetBytes.test.ts](../../apps/app/src/core/vault/asset/importAssetBytes.test.ts) — **5 passed**.

**Target:** Redesign publication/reference/GC closure; preserve collision safety. Requirements: P-01, P-12, P-18, P-34. Proposed owner: Asset lifecycle under Space domain commands.

**Next validation:** R04/R05: required assets before publication, retained/pinned versions and outbox roots. Current allowed scope exception is not an invented production architecture violation.

### C30: Search and indexing

**Observed:** SearchService ranks notes/templates/assets/folders with live edit overlays. ParsedNoteCache is a content/fingerprint-based memo, not canonical content or an FTS database. Knowledge builders derive task/tag/link views.

**Source:** [SearchService.ts](../../apps/app/src/core/application/search/SearchService.ts); [ParsedNoteCache.ts](../../apps/app/src/core/vault/persistence/parsedNoteCache/ParsedNoteCache.ts); [TaskBuilder.ts](../../apps/app/src/core/vault/knowledge/TaskBuilder.ts).

**Tests:** [SearchService.test.ts](../../apps/app/src/core/application/search/SearchService.test.ts) — **55 passed**; [ParsedNoteCache.test.ts](../../apps/app/src/core/vault/persistence/parsedNoteCache/ParsedNoteCache.test.ts) — located, not run.

**Target:** Keep live search/derived-data guarantees; storage/index technology unresolved. Requirements: P-08, P-11, P-22. Proposed owner: Derived query/index subsystem.

**Next validation:** R03/R04: canonical freshness, rebuild after corruption, task pages/inbox. Earlier SQLite FTS research is not a current production feature/defect.

### C31: Tags, favorites and presentation metadata

**Observed:** TagOperations, membership selectors and Space stores support tag editing/favorite/collection presentation. Metadata tags and inline tags are distinct current sources with explicit interpretation.

**Source:** [TagOperations.ts](../../apps/app/src/core/application/tags/TagOperations.ts); [MembershipSelector.ts](../../apps/app/src/core/application/membership/MembershipSelector.ts); [PageMetadata.ts](../../apps/app/src/core/vault/models/PageMetadata.ts).

**Tests:** [TagOperations.test.ts](../../apps/app/src/core/application/tags/TagOperations.test.ts) — located, not run; [MembershipSelector.test.ts](../../apps/app/src/core/application/membership/MembershipSelector.test.ts) — **75 passed**.

**Target:** Keep these capabilities; resolve schema and representation under R03. Requirements: P-11, P-13, P-25. Proposed owner: Entity/tag operations and derived membership.

**Next validation:** R03: define canonical tag membership/display identity and inheritance without treating UI mirrors as extra truth.

### C32: Persistence gate and native atomic path

**Observed:** PagePersistenceCoordinator serializes page/folder/resource intents and checks expected content fingerprints. Application builds the atomic stack; featureFlags.atomicWrites is true and macOS native commands are registered conditionally. Atomic writes are not merely an unwired proposal in this revision.

**Source:** [PagePersistenceCoordinator.ts](../../apps/app/src/core/vault/persistence/PagePersistenceCoordinator.ts); [createAtomicWriteStack.ts](../../apps/app/src/core/vault/atomicWrite/createAtomicWriteStack.ts); [featureFlags.ts](../../apps/app/src/core/featureFlags.ts); [lib.rs](../../apps/app/src-tauri/src/lib.rs).

**Tests:** [PageOperations.atomicSave.test.ts](../../apps/app/src/core/application/page/PageOperations.atomicSave.test.ts) — **20 passed**; [PageOperations.saveFailure.test.ts](../../apps/app/src/core/application/page/PageOperations.saveFailure.test.ts) — **46 passed**.

**Target:** Keep explicit outcomes/guards; persistence mechanism remains a candidate decision. Requirements: P-02, P-06, P-12, P-16. Proposed owner: Persistence transaction boundary and platform durability adapter.

**Next validation:** R04/R07: native APFS failure/uncertainty, multi-entity atomic scope, authority crash and persistent outbox. In-memory writer tests do not certify native durability.

### C33: External filesystem reconciliation

**Observed:** VaultSyncService consumes watcher/reconciliation paths, repairs metadata and updates clean open sessions. Dirty sessions retain their base fingerprint so subsequent save can conflict. This is not an iCloud/Drive upload or globally ordered state protocol.

**Source:** [VaultSyncService.ts](../../apps/app/src/core/vault/sync/VaultSyncService.ts); [VaultSyncCoordinator.ts](../../apps/app/src/core/vault/sync/VaultSyncCoordinator.ts); [LocalFileSystemWatcher.ts](../../apps/app/src/core/vault/providers/LocalFileSystemWatcher.ts).

**Tests:** [VaultSyncService.crossInstanceMove.test.ts](../../apps/app/src/core/vault/sync/VaultSyncService.crossInstanceMove.test.ts) — **11 passed**.

**Target:** Keep stale-write protection and reconciliation concept; redesign provider transport separately. Requirements: P-06, P-08, P-19, P-21, P-24. Proposed owner: Local reconciliation and separate validated provider ingestion.

**Next validation:** R05: deterministic remote winners, deleted task ownership, history capture and replay. Current cross-instance tests share a filesystem world, not real distributed provider delivery.

### C34: Crash recovery and shutdown

**Observed:** RecoveryJournal stores pending-work snapshots separately with debounce/retry and saved-record cleanup. Window close flushes/checks pending work and may ask explicit close-and-lose versus cancel. Recovery is not retained user history.

**Source:** [RecoveryJournal.ts](../../apps/app/src/core/recovery/RecoveryJournal.ts); [RecoveryOperations.ts](../../apps/app/src/core/application/recovery/RecoveryOperations.ts); [windowCloseHandler.ts](../../apps/app/src/app/windowCloseHandler.ts).

**Tests:** [Application.recovery.test.ts](../../apps/app/src/core/application/Application.recovery.test.ts) — **4 passed**; [windowCloseHandler.test.ts](../../apps/app/src/app/windowCloseHandler.test.ts) — located, not run.

**Target:** Keep recovery and honest close outcomes; redesign session/context leases. Requirements: P-06, P-07, P-17, P-18. Proposed owner: Recovery owner and application lifecycle coordinator.

**Next validation:** R04: snapshot interval/power-loss limits, active-owner discovery and last-view closure; specify whether target P-07 permits explicit discard rather than silently inheriting the existing override.

### C35: Archive, restore, purge and retention

**Observed:** Gate/facades move/archive/restore and permit permanent deletion primarily from archive; trash routing is native. Automatic archive cleanup has a 30-calendar-day policy. That is not version retention/pin handling.

**Source:** [PageOperations.ts](../../apps/app/src/core/application/page/PageOperations.ts); [archiveRetention.ts](../../apps/app/src/core/application/archive/archiveRetention.ts); [macos_trash.rs](../../apps/app/src-tauri/src/macos_trash.rs).

**Tests:** [PageOperations.archiveRestore.test.ts](../../apps/app/src/core/application/page/PageOperations.archiveRestore.test.ts) — **38 passed**.

**Target:** Keep recoverable lifecycle; redesign cascade/purge closure for owned tasks/history/media. Requirements: P-12, P-13, P-18, P-27, P-32. Proposed owner: Lifecycle policy and persistence/history/asset owners.

**Next validation:** R03/R04: archive vs delete vs purge, pinned history and restoration after task move. Do not silently carry the old 30-day archive policy into new version cleanup.

### C36: Retained document versions and pins

**Observed:** Current DocumentSession revisions, editor history cache and recovery records have different lifetimes. No retained document-version catalog/pin/restore API was identified in audited production models/facades/menus or package manifests.

**Source:** [DocumentSession.ts](../../apps/app/src/core/engine/DocumentSession.ts); [editorHistoryCache.ts](../../apps/app/src/features/markdown/editor/codemirror/editorHistoryCache.ts); [RecoveryJournal.ts](../../apps/app/src/core/recovery/RecoveryJournal.ts).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Redesign/new persistent history capability; do not relabel existing caches as history. Requirements: P-12, P-17, P-18, P-21, P-33. Proposed owner: Durable version/history owner.

**Next validation:** R03/R04: pins, schema-readable versions, overwritten-state retention, restore provenance and comment/task/media closure.

## Integrations, security and platform coverage

### C37: CLI and MCP

**Observed:** Production package scripts expose frontend/Tauri/test/automation commands. Core facades are wired by Application, but no user-facing Clutter CLI/MCP adapter or headless shared authority was located in the scoped packages/native entrypoints. An npm tauri launcher is not the desired CLI.

**Source:** [Application.ts](../../apps/app/src/core/application/Application.ts); [main.rs](../../apps/app/src-tauri/src/main.rs); [package.json](../../packages/automation/package.json).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Redesign/new core capability; no independent direct-file tool writer. Requirements: P-02, P-09, P-16, P-24. Proposed owner: Shared command/query core, headless host and thin CLI/MCP adapters.

**Next validation:** R03/R06: signatures, JSON errors/durability, authorization, process election, retries and app-closed use.

### C38: Provider sync and background lifetime

**Observed:** No opt-in provider/outbox/state-package implementation was located in source/manifests. Current watcher reconciliation and remote HTTP image fetch are different capabilities. Native atomic writer comments explicitly do not qualify cloud-synced folders.

**Source:** [VaultSyncService.ts](../../apps/app/src/core/vault/sync/VaultSyncService.ts); [atomic_replace.rs](../../apps/app/src-tauri/src/atomic_replace.rs); [appFetch.ts](../../apps/app/src/shared/helpers/appFetch.ts).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Redesign/new optional provider capability; live cloud collaboration deferred. Requirements: P-08, P-19, P-21, P-24. Proposed owner: Sync policy, durable outbox/ingest and provider adapters.

**Next validation:** R05: provider feasibility, ordering, asset completeness, tombstones, cursors/status/echo/restart, independently qualified iCloud/Drive; never infer support from current filesystem access.

### C39: Comments, sharing and live collaboration

**Observed:** No anchored thread/membership/live-presence product pipeline was located in scoped production models, package/native registrations and UI searches. Link sharing in content is not role-based access. The target comment policy is agreed but its delivery phase remains open.

**Source:** [Page.ts](../../apps/app/src/core/vault/models/Page.ts); [PageMetadata.ts](../../apps/app/src/core/vault/models/PageMetadata.ts); [Application.ts](../../apps/app/src/core/application/Application.ts); [lib.rs](../../apps/app/src-tauri/src/lib.rs).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Unresolved comment delivery timing; future cloud roles/live collaboration deferred. Requirements: P-19, P-20, P-24, P-33. Proposed owner: Comment/history identity now; future membership/collaboration authority.

**Next validation:** R03: anchor/deletion restore closure; future T-22 before cloud access. Provider-folder permissions cannot implement private per-page roles.

### C40: Export and interoperability

**Observed:** Native export helpers use a user-picked single-use destination ticket for resource/code/text downloads; original notes are accessible Markdown. This does not establish full native Space bundle export/import with history/assets or a guarded checkout/commit protocol.

**Source:** [nativeExport.ts](../../apps/app/src/shared/helpers/nativeExport.ts); [downloadTextFile.ts](../../apps/app/src/shared/helpers/downloadTextFile.ts); [export_file.rs](../../apps/app/src-tauri/src/export_file.rs); [FrontmatterSerializer.ts](../../apps/app/src/core/vault/ingest/FrontmatterSerializer.ts).

**Tests:** [nativeExport.test.ts](../../apps/app/src/shared/helpers/nativeExport.test.ts) — located, not run.

**Target:** Keep user-controlled export; redesign loss-aware native/Markdown interchange. Requirements: P-09, P-10, P-12, P-22. Proposed owner: Shared interchange commands and platform save-panel adapter.

**Next validation:** R03/R04: canonical schema, manifests/identities, round-trip fidelity/loss reporting, history closure and guarded AI file edits.

### C41: Convert selected content into a page

**Observed:** General page create/link/embed operations exist; no dedicated atomic selected-text/block extraction-to-page command was identified in the audited facades/editor action paths. That does not imply existing links/embeds are missing.

**Source:** [PageOperations.ts](../../apps/app/src/core/application/page/PageOperations.ts); [MarkdownEditor.tsx](../../apps/app/src/features/markdown/editor/MarkdownEditor.tsx); [linkContextMenu.ts](../../apps/app/src/features/markdown/editor/codemirror/link/linkContextMenu.ts).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Redesign/new explicit conversion intent. Requirements: P-01, P-03, P-30. Proposed owner: Document conversion command and editor selection adapter.

**Next validation:** R02/R03: preserve selected content, new page/link insertion atomicity, block/task exceptions and undo/failure recovery.

### C42: Backup and encryption scope

**Observed:** Current recovery/trash/export mechanisms are not an independently restored full-Space backup pipeline. No encrypted-Space feature was located in audited entrypoints. Automatic backup and initial encryption are not current target promises.

**Source:** [RecoveryJournal.ts](../../apps/app/src/core/recovery/RecoveryJournal.ts); [nativeExport.ts](../../apps/app/src/shared/helpers/nativeExport.ts); [lib.rs](../../apps/app/src-tauri/src/lib.rs).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Unresolved future encryption; automatic backup feature deferred with snapshot seam required. Requirements: P-12, P-18, P-24. Proposed owner: Persistence snapshot/asset roots and later backup/crypto integrations.

**Next validation:** R04: specify consistent snapshot closure now, automatic scheduling/rotation later; do not implement an unrequested encryption/key system.

### C43: Platform and native integration

**Observed:** Tauri separates native files, but current atomic registration is cfg(macos), main-window/menu/Trash/sandbox paths are platform-specific and shared modules import Tauri directly. Windows-ready boundaries cannot be inferred from Tauri alone.

**Source:** [lib.rs](../../apps/app/src-tauri/src/lib.rs); [app_menu.rs](../../apps/app/src-tauri/src/app_menu.rs); [macos_trash.rs](../../apps/app/src-tauri/src/macos_trash.rs); [LocalFileSystem.ts](../../apps/app/src/core/vault/providers/LocalFileSystem.ts).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Redesign clear shared-core/OS adapters while shipping macOS first. Requirements: P-02, P-23, P-35. Proposed owner: Platform interfaces and composition roots.

**Next validation:** R06: IPC/filesystem/credential/notifications/menu/clipboard/window/path boundaries and build dependency checks. Do not claim Windows runtime support yet.

### C44: Security, network and save destinations

**Observed:** Native single-use export tickets restrict destination writes; appFetch uses Tauri HTTP only in desktop and browser fetch otherwise. These are existing boundaries, not proof of the complete future tool/provider trust model.

**Source:** [nativeExport.ts](../../apps/app/src/shared/helpers/nativeExport.ts); [appFetch.ts](../../apps/app/src/shared/helpers/appFetch.ts); [fs_authorization.rs](../../apps/app/src-tauri/src/fs_authorization.rs).

**Tests:** [nativeExport.test.ts](../../apps/app/src/shared/helpers/nativeExport.test.ts) — located, not run.

**Target:** Keep explicit user grants; redesign headless/provider input validation coherently. Requirements: P-02, P-09, P-24, P-35. Proposed owner: Core access checks and native credential/filesystem/provider adapters.

**Next validation:** R06: local IPC trust, MCP scope, path traversal, package validation and content-free diagnostics; keep AI-provider calls opt-in.

### C45: Automation and evidence

**Observed:** A separate automation workspace drives real Tauri through WebDriver with compile/runtime gates. Package docs call it proof of concept, and scenarios/configs exist. Vitest defaults Node, with per-test jsdom environments. Neither source existence nor the present selected run proves native acceptance.

**Source:** [AUTOMATION.md](../../packages/automation/AUTOMATION.md); [poc.spec.ts](../../packages/automation/scenarios/poc.spec.ts); [lib.rs](../../apps/app/src-tauri/src/lib.rs).

**Tests:** No directly qualifying test identified in this bounded audit; this is not proof that no related test exists..

**Target:** Keep external native harness boundary; qualify current suitability rather than assume coverage. Requirements: P-03, P-06, P-16, P-23, P-35. Proposed owner: Test infrastructure outside product policy.

**Next validation:** R06/R07: actual Mac keyboard/IME/focus/native-menu/failure cases and reproducible logs. Linux cannot close that gate.

## Contradictions and guardrails for the next specifications

| Finding                                                                | Evidence and interpretation                                                                    | Required follow-through                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Old table matrix says no table rendering is wired                      | [Old matrix](../editor-feature-matrix.md) versus C23 live extension/controller paths           | Carry actual table selection/history surface into R02; do not plan from the stale absent-feature row              |
| Old matrix says no YAML/properties block parser exists                 | Same old matrix versus C04 parser/property UI                                                  | Preserve the implemented property behaviour; no claim of a full arbitrary YAML engine                             |
| ADR-063 still marked Proposed in old ADR index                         | [Old ADR index](../adr/README.md) versus C32 true flag/atomic construction/native registration | Treat existing writer as live in this revision; source/tests do not retroactively approve its native guarantees   |
| Existing ADR-044 routes new tasks into today's daily note              | C10 versus confirmed independent inbox contract                                                | Intentional target replacement; do not call it an accidental current bug                                          |
| A date mention currently supplies task dueDate                         | C13/C16 versus separate scheduled/deadline/reminder contract                                   | Map old meaning explicitly; do not invent reminders from timestamps                                               |
| Workspace comments enumerate more task pages than live union           | C17 and dataset tabs in PageHost                                                               | Distinguish page destinations, sidebar sections and dataset tabs; none proves document tab support                |
| Recovery/session revisions can be mistaken for retained versions       | C22/C34/C36                                                                                    | New history/pin capability needs storage/schema and test evidence of its own                                      |
| Current close can permit explicit loss after user confirmation         | C34 versus target P-07                                                                         | Specify deliberate discard semantics before adopting lifecycle behaviour; never silently weaken protection        |
| Provider latest-wins differs from local stale-write protection         | C33/C38 and current sync contract                                                              | Keep local revision guards; qualify remote winner order/history/tombstones separately                             |
| Sidebar and task collection read different freshness stages            | Sidebar uses EffectivePageState.getTasks(); PageHost passes vault.tasks()                      | Specify a shared read contract before R03; a possible unsaved-state discrepancy has not been reproduced in the UI |
| File-backed live/saved overlays are not automatically duplicated truth | C20/C32                                                                                        | Preserve explicit durability/view projection boundaries rather than remove required replicas/history              |

## Gaps that matter before R02/R03

1. **Editor outcome matrix:** fill exact keyboard/selection/focus/IME/clipboard and
   table/media boundary outcomes. Clarify intentional discard and undo after whole-
   document remote replacement; do not infer from whichever engine is easiest.
2. **Task identity and data closure:** define page body, note-or-inbox placement,
   copy/move/restore and recurrence generation. Restore after a task moved elsewhere
   must not create two owners. Nested independent tasks versus task-body content
   remains a schema detail, not permission to introduce subtasks.
3. **History/asset/comment closure:** retained versions, pinned roots, explicit purge
   and comment-restoration semantics cannot be supplied by current undo/recovery.
4. **Local authority versus provider protocol:** current application facades/watchers
   are useful evidence, not the future headless multi-client host or provider outbox.
5. **Release detail still open:** comment timing, predefined fields/default visibility,
   exact property option types, duplicate-open policy, retention/scale budgets and
   reminder time-zone/delivery ownership. Resolve when they affect their scoped spec;
   do not restart the answered product questionnaire.

Every current capability group requested by R01 is accounted for, with bounded
coverage and unresolved items visible. This completes the inventory deliverable,
not architecture qualification. **Next is R02**: write `editor-interaction-spec.md`
using C17–C25 plus task/date/page conversion contracts, with explicit expected
outcomes and native validation cases. R03 consumes this inventory and R02; no
production editor/storage/API rewrite is authorized by completing R01.
