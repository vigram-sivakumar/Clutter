# Arc 5 — Architecture Checklist

## 1. Purpose

Arc 5 represents the final architecture consolidation before feature development begins in earnest. The goal is to freeze the architecture so that all future engineering work focuses on enabling business capabilities, not on redesigning or refactoring foundational architecture. This ensures stability, clarity, and a shared understanding for all contributors.

## 2. Success Criteria

- [ ] Rendering architecture is consolidated and unified.
- [ ] Editing pipeline is complete, observable, and robust.
- [ ] Persistence pipeline is complete and reliable.
- [ ] CRUD (Create, Read, Update, Delete) operations have clearly defined, validated flows.
- [ ] Future views or features require only new data providers or view-models, not new rendering architectures.

## 3. Architectural Principles

- **Markdown is the source of truth.**
- **Vault owns durable knowledge.**
- **Workspace owns navigation state.**
- **DocumentSession owns editing state.**
- **SaveCoordinator owns persistence.**
- **React renders state and contains no business logic.**
- **Prefer reuse by composition, not inheritance or duplication.**
- **Build abstractions from evidence, not anticipation.**

## Current Architecture Summary

### Current Request Flow

User requests are routed through the UI layer, which interacts with Workspace for navigation state changes. Workspace communicates with Vault to access or modify files. DocumentSession manages editing state per document, coordinating with SaveCoordinator for persistence.

### Current Editing Flow

Editing occurs within DocumentSession instances, which hold reactive state representing document content and metadata. Changes are tracked for dirty state, and DocumentSession emits updates to the UI. Undo/redo is not yet implemented but planned.

### Current Save Flow

SaveCoordinator mediates all persistence operations, routing save requests to VaultFileSystem. VaultFileSystem performs actual file writes to disk. After a successful save, Vault refreshes its internal state and the UI updates accordingly.

### Current Rendering Flow

Rendering is model-driven with React components rendering state from DocumentSession and Workspace. PageHost maintains a registry of page types and renders appropriate components. Duplicate components have been identified and are targeted for consolidation.

### Known Architectural Gaps Discovered During Arc 5 Validation

- SaveCoordinator lacks complete error handling and save state notifications.
- DocumentSession observability is incomplete; some state changes are not fully reactive.
- IdentityResolver sometimes falls back to unstable IDs, risking session duplication.
- FrontmatterSerializer has limitations in metadata fidelity and round-trip accuracy.
- Vault mutation strategy requires refinement to ensure consistency and avoid race conditions.

## 4. Phase 1 — Rendering Consolidation

### Objective

Consolidate the rendering architecture to eliminate duplication and enforce a model-driven UI approach, ensuring maintainability and extensibility.

### Why this phase exists

Multiple duplicate components and ad-hoc wrappers have led to complexity and inconsistent behavior. Consolidation is necessary to stabilize the UI foundation.

### Current state

Several components like TopBar and Description are duplicated with minor variations. PageHost lacks a centralized page-type registry. Rendering sometimes uses feature-specific wrappers without behavioral justification.

### Target architecture

A unified set of reusable components driven purely by state, with a central page-type registry in PageHost. Specialized components exist only when behavior differs concretely.

### Files expected to change

- PageHost
- TopBar
- Description
- Various UI components involved in rendering

### Dependencies

- None (this is the foundational phase)

### Implementation strategy

1. Identify and remove duplicate TopBar components, consolidating into one implementation.
2. Consolidate Description components similarly.
3. Audit all specialized components to verify behavioral necessity; remove those based solely on domain origin.
4. Implement a page-type registry in PageHost to centralize page discovery and rendering.
5. Refactor rendering logic to be purely model-driven, eliminating ad-hoc data wrappers.

### Risks

- Breaking UI functionality if components are removed prematurely.
- Resistance from feature owners who rely on specialized components.

### Validation strategy

- Manual testing of all page types for consistent rendering.
- Code review to ensure no duplicate components remain.
- Automated tests for rendering correctness.

### Acceptance criteria

- Only one TopBar and Description implementation exists unless behavior differs.
- PageHost has a centralized page-type registry.
- Rendering is purely model-driven with no ad-hoc wrappers.
- Specialized components exist only where behavior concretely differs.

**Checklist & Acceptance Criteria:**

- [ ] Remove all duplicate TopBar components.
  - Acceptance: Only one TopBar implementation exists unless a different behavior is required.
- [ ] Remove all duplicate Description components.
  - Acceptance: Only one Description implementation exists unless behavior differs.
- [ ] Specialized components exist only where concrete behavior differs (not just domain or data).
  - Acceptance: No specialized component exists solely due to domain object origin.
- [ ] Add a page-type registry in `PageHost`.
  - Acceptance: All page types are registered and discoverable via a central registry.
- [ ] Rendering is model-driven where appropriate.
  - Acceptance: UI is a pure function of state; no ad-hoc wrappers for data shape.
- [ ] No feature-specific wrapper exists solely because data came from a different domain object.
  - Acceptance: All wrappers have behavioral justification or are removed.

## 5. Phase 2 — Editing Architecture

### Objective

Define and implement a robust, observable editing architecture centered around DocumentSession, enabling clear lifecycle management and future undo/redo support.

### Why this phase exists

Editing state management is currently incomplete, with sessions lacking clear lifecycle and observability, limiting reliability and future extensibility.

### Current state

DocumentSession exists but lacks consistent lifecycle management and full observability. Dirty state tracking is partial. Revision handling and session reuse are not fully implemented.

### Target architecture

DocumentSession instances have well-defined creation, reuse, and disposal semantics. Editing state is fully observable and reactive. Dirty state is tracked and exposed. Revision handling supports versioning. Ready for undo/redo layering.

### Files expected to change

- DocumentSession
- Workspace (for session reuse)
- UI components consuming DocumentSession state

### Dependencies

- Phase 1 completion for stable rendering foundation

### Implementation strategy

1. Define DocumentSession lifecycle events and management patterns.
2. Implement observability using reactive state libraries or patterns.
3. Track and expose dirty state with clear rules for setting and clearing.
4. Add revision handling to create or update revisions on save.
5. Support session reuse by linking navigation to existing sessions.
6. Define and implement close behavior with unsaved changes prompts.
7. Add save state notifications for UI feedback.
8. Design editing architecture to accommodate future undo/redo.

### Risks

- Complexity in managing session lifecycle and observability.
- Potential data loss if dirty state is mishandled.

### Validation strategy

- Unit and integration tests covering lifecycle and observability.
- Manual testing of dirty state behavior and session reuse.
- Verification of revision creation on save.

### Acceptance criteria

- DocumentSession lifecycle is clearly defined and predictable.
- Editing state changes emit updates to consumers.
- Dirty state is tracked and cleared appropriately.
- Revision handling is implemented.
- Session reuse works without duplication.
- Close behavior prompts for unsaved changes and releases resources.
- Save state notifications are available.
- Architecture is ready for future undo/redo.

**Checklist & Acceptance Criteria:**

- [ ] DocumentSession lifecycle is clearly defined.
  - Acceptance: Sessions are created, reused, and disposed in a predictable way.
- [ ] DocumentSession is observable (reactive state).
  - Acceptance: Changes emit updates; consumers are notified.
- [ ] Dirty state is tracked and exposed.
  - Acceptance: Editing marks session as dirty; saved state clears dirty flag.
- [ ] Revision handling is implemented.
  - Acceptance: Each save creates a new revision or updates the current.
- [ ] Session reuse is supported.
  - Acceptance: Navigating to the same document reuses session; no duplicate sessions.
- [ ] Close behavior is defined.
  - Acceptance: Closing a session prompts for unsaved changes; resources are released.
- [ ] Save state notifications are available.
  - Acceptance: UI can show saving, saved, or failed-to-save states.
- [ ] Ready for future undo/redo.
  - Acceptance: Editing architecture makes it possible to layer undo/redo in the future.

## 6. Phase 3 — Persistence Pipeline

### Objective

Implement a robust persistence pipeline ensuring reliable, consistent saves through SaveCoordinator and VaultFileSystem, with comprehensive error handling and state synchronization.

### Why this phase exists

Persistence is critical for data integrity. Current save flow lacks robustness and error handling, risking data loss or corruption.

### Current state

SaveCoordinator exists but lacks full mediation of all saves and error handling. VaultFileSystem performs writes but with limited coordination. Dirty flag clearing and save failure handling are incomplete.

### Target architecture

All persistence flows through SaveCoordinator, which coordinates with VaultFileSystem for durable writes. Errors are surfaced and logged without corrupting state. Dirty flags clear only after confirmed saves. Identity is preserved. Frontmatter serialization is accurate.

### Files expected to change

- SaveCoordinator
- VaultFileSystem
- DocumentSession (for dirty flag management)

### Dependencies

- Phase 2 completion for stable editing state

### Implementation strategy

1. Ensure all save operations route through SaveCoordinator.
2. Implement or improve VaultFileSystem file write mechanisms.
3. Add robust error handling and logging in SaveCoordinator.
4. Clear dirty flags only after confirmed successful saves.
5. Preserve local edits on save failure.
6. Ensure document IDs remain stable across saves.
7. Improve frontmatter serialization for metadata fidelity.
8. Replace mutable path/title-based identity with stable IDs.

### Risks

- Data loss or corruption if error handling is incomplete.
- Performance impact from save coordination.

### Validation strategy

- Automated tests simulating save success and failure scenarios.
- Manual validation of dirty flag behavior and identity preservation.
- Verification of frontmatter serialization round-trip.

### Acceptance criteria

- SaveCoordinator mediates all persistence.
- File writes are performed only via VaultFileSystem.
- Errors surface to users and do not corrupt state.
- Dirty flag clears only after confirmed save.
- Save failures retain local edits.
- Document IDs remain stable.
- Frontmatter serialization is accurate.
- Stable IDs replace mutable identity sources.

**Checklist & Acceptance Criteria:**

- [ ] SaveCoordinator is implemented and mediates all persistence.
  - Acceptance: All saves route through SaveCoordinator.
- [ ] Real file writes are performed via VaultFileSystem.
  - Acceptance: File system is the only mechanism for durable writes.
- [ ] Error handling is robust.
  - Acceptance: Save failures surface to the user; errors are logged and do not corrupt state.
- [ ] Dirty flag is cleared only after confirmed save.
  - Acceptance: UI accurately reflects saved/unsaved state.
- [ ] Save failures do not lose local edits.
  - Acceptance: Edits remain in session until successful save.
- [ ] Identity is preserved across saves.
  - Acceptance: Document IDs remain stable; no accidental duplication or loss.
- [ ] Frontmatter serialization improvements are in place.
  - Acceptance: Metadata is accurately serialized/deserialized; round-trip fidelity.
- [ ] Stable IDs are used everywhere.
  - Acceptance: No code relies on mutable paths or titles for identity.

## 7. Phase 4 — CRUD Validation

### 7.1 Create

#### Purpose

Ensure reliable creation of new documents and folders with stable identity and immediate editability.

#### User interaction

User initiates creation via UI (e.g., new file or folder button).

#### Expected application flow

UI triggers Workspace navigation update → Workspace requests Vault to create file/folder → Vault creates on disk → DocumentSession opens for new document.

#### Components involved

UI, Workspace, Vault, DocumentSession.

#### Domain layer responsibilities

Define creation commands and validate new document metadata.

#### Application layer responsibilities

Coordinate creation flow, update navigation, open sessions.

#### Infrastructure responsibilities

Perform file system operations to create files/folders.

#### UI update sequence

Show creation UI → Reflect new document in navigation → Open editing session.

#### Failure scenarios

Disk write failure → Show error → Do not open session.

#### Edge cases

Creating duplicate names → Validation error.  
Creating in non-existent folders → Error handling.

#### Manual testing

Create files/folders, verify navigation and editing.

#### Acceptance criteria

- File/folder created on disk.
- Navigation updates accordingly.
- Editing session opens immediately.

### 7.2 Rename

#### Purpose

Support renaming files and folders maintaining identity and references.

#### User interaction

User renames item in UI.

#### Expected application flow

UI triggers Vault rename → Vault renames on disk → Workspace updates navigation → DocumentSession updates identity.

#### Components involved

UI, Vault, Workspace, DocumentSession.

#### Domain layer responsibilities

Validate rename operations.

#### Application layer responsibilities

Coordinate rename, update navigation and sessions.

#### Infrastructure responsibilities

Perform file system rename.

#### UI update sequence

Reflect new name in navigation and editor.

#### Failure scenarios

Rename conflict → Show error → Rollback.

#### Edge cases

Renaming to existing name → Conflict error.  
Open sessions during rename → Update session identity.

#### Manual testing

Rename files/folders, verify navigation and session updates.

#### Acceptance criteria

- File/folder renamed on disk.
- Navigation and session update.
- References remain valid.

### 7.3 Delete

#### Purpose

Allow deletion of files and folders with proper cleanup of sessions and navigation.

#### User interaction

User deletes item via UI.

#### Expected application flow

UI triggers Vault delete → Vault deletes on disk → Workspace updates navigation → DocumentSession closes.

#### Components involved

UI, Vault, Workspace, DocumentSession.

#### Domain layer responsibilities

Confirm deletion intent.

#### Application layer responsibilities

Coordinate deletion and session disposal.

#### Infrastructure responsibilities

Perform file system deletion.

#### UI update sequence

Remove item from navigation and editor.

#### Failure scenarios

Delete failure → Show error → Retain session.

#### Edge cases

Deleting open documents → Close sessions gracefully.  
Deleting non-empty folders → Confirmation required.

#### Manual testing

Delete files/folders, verify UI and session cleanup.

#### Acceptance criteria

- File/folder deleted on disk.
- Navigation updates.
- Sessions close appropriately.

### 7.4 Move

#### Purpose

Enable moving files and folders preserving identity and references.

#### User interaction

User moves item via UI (drag/drop or move command).

#### Expected application flow

UI triggers Vault move → Vault moves on disk → Workspace updates navigation → DocumentSession updates identity.

#### Components involved

UI, Vault, Workspace, DocumentSession.

#### Domain layer responsibilities

Validate move operations.

#### Application layer responsibilities

Coordinate move and update state.

#### Infrastructure responsibilities

Perform file system move.

#### UI update sequence

Reflect new location in navigation and editor.

#### Failure scenarios

Move failure → Show error → Rollback.

#### Edge cases

Moving to existing location → Conflict error.  
Open sessions during move → Update session identity.

#### Manual testing

Move files/folders, verify navigation and session updates.

#### Acceptance criteria

- File/folder moved on disk.
- Navigation and session update.

### 7.5 Duplicate

#### Purpose

Support duplicating files with new stable IDs and open sessions.

#### User interaction

User duplicates file via UI.

#### Expected application flow

UI triggers Vault copy → Vault copies file → Workspace opens new session for duplicate.

#### Components involved

UI, Vault, Workspace, DocumentSession.

#### Domain layer responsibilities

Generate new stable IDs.

#### Application layer responsibilities

Coordinate duplication and session opening.

#### Infrastructure responsibilities

Perform file system copy.

#### UI update sequence

Show duplicate in navigation and open editor.

#### Failure scenarios

Copy failure → Show error → No session opened.

#### Edge cases

Duplicate name conflicts → Resolve or error.

#### Manual testing

Duplicate files, verify new session and identity.

#### Acceptance criteria

- New file created with new ID.
- Session opens for duplicate.

### 7.6 Update Markdown

#### Purpose

Ensure markdown content edits persist correctly.

#### User interaction

User edits markdown in editor.

#### Expected application flow

Session updates content → SaveCoordinator persists → Vault updates file.

#### Components involved

UI, DocumentSession, SaveCoordinator, Vault.

#### Domain layer responsibilities

Validate content changes.

#### Application layer responsibilities

Coordinate save flow.

#### Infrastructure responsibilities

Write updated file to disk.

#### UI update sequence

Reflect saved state and content.

#### Failure scenarios

Save failure → Show error → Retain edits.

#### Edge cases

Concurrent edits → Conflict resolution.

#### Manual testing

Edit markdown, save, reload to verify persistence.

#### Acceptance criteria

- Markdown updates saved and loaded correctly.

### 7.7 Update Metadata

#### Purpose

Persist metadata changes reliably.

#### User interaction

User edits metadata fields.

#### Expected application flow

Session updates metadata → SaveCoordinator persists → Vault updates file.

#### Components involved

UI, DocumentSession, SaveCoordinator, Vault.

#### Domain layer responsibilities

Validate metadata changes.

#### Application layer responsibilities

Coordinate save flow.

#### Infrastructure responsibilities

Write updated file with metadata.

#### UI update sequence

Reflect saved metadata.

#### Failure scenarios

Save failure → Show error → Retain metadata changes.

#### Edge cases

Metadata schema changes → Migration handling.

#### Manual testing

Edit metadata, save, reload to verify persistence.

#### Acceptance criteria

- Metadata changes persist and round-trip.

### 7.8 Favorite

#### Purpose

Allow marking documents as favorite and persist status.

#### User interaction

User toggles favorite flag.

#### Expected application flow

Session updates metadata → SaveCoordinator persists → Vault updates.

#### Components involved

UI, DocumentSession, SaveCoordinator, Vault.

#### Domain layer responsibilities

Manage favorite flag.

#### Application layer responsibilities

Coordinate save.

#### Infrastructure responsibilities

Persist changes.

#### UI update sequence

Reflect favorite status in UI.

#### Failure scenarios

Save failure → Show error → Retain favorite status.

#### Edge cases

Bulk favorite changes.

#### Manual testing

Toggle favorite, save, reload.

#### Acceptance criteria

- Favorite status persists.

### 7.9 Archive

#### Purpose

Support archiving documents with persistence.

#### User interaction

User archives/unarchives document.

#### Expected application flow

Session updates metadata → SaveCoordinator persists → Vault updates.

#### Components involved

UI, DocumentSession, SaveCoordinator, Vault.

#### Domain layer responsibilities

Manage archive flag.

#### Application layer responsibilities

Coordinate save.

#### Infrastructure responsibilities

Persist changes.

#### UI update sequence

Reflect archive status.

#### Failure scenarios

Save failure → Show error → Retain archive flag.

#### Edge cases

Restore from archive.

#### Manual testing

Archive/unarchive, save, reload.

#### Acceptance criteria

- Archive status persists.

### 7.10 Restore

#### Purpose

Allow restoring archived documents.

#### User interaction

User restores document from archive.

#### Expected application flow

Session updates metadata → SaveCoordinator persists → Vault updates.

#### Components involved

UI, DocumentSession, SaveCoordinator, Vault.

#### Domain layer responsibilities

Manage archive flag removal.

#### Application layer responsibilities

Coordinate save.

#### Infrastructure responsibilities

Persist changes.

#### UI update sequence

Make document accessible and unarchived.

#### Failure scenarios

Save failure → Show error → Retain archive status.

#### Edge cases

Restore conflicts.

#### Manual testing

Restore document, save, reload.

#### Acceptance criteria

- Restored document accessible and unarchived.

### 7.11 Create Folder

#### Purpose

Enable creation of folders in Vault.

#### User interaction

User creates folder via UI.

#### Expected application flow

UI triggers Vault create directory → Workspace updates navigation.

#### Components involved

UI, Vault, Workspace.

#### Domain layer responsibilities

Validate folder creation.

#### Application layer responsibilities

Coordinate navigation update.

#### Infrastructure responsibilities

Create directory on disk.

#### UI update sequence

Show new folder in navigation.

#### Failure scenarios

Create failure → Show error.

#### Edge cases

Duplicate folder names.

#### Manual testing

Create folders, verify navigation.

#### Acceptance criteria

- Folder created on disk.
- Navigation updates.

### 7.12 Rename Folder

#### Purpose

Support renaming folders.

#### User interaction

User renames folder in UI.

#### Expected application flow

UI triggers Vault rename directory → Workspace updates navigation.

#### Components involved

UI, Vault, Workspace.

#### Domain layer responsibilities

Validate rename.

#### Application layer responsibilities

Coordinate navigation update.

#### Infrastructure responsibilities

Rename directory on disk.

#### UI update sequence

Reflect new folder name.

#### Failure scenarios

Rename failure → Show error.

#### Edge cases

Rename conflicts.

#### Manual testing

Rename folders, verify navigation.

#### Acceptance criteria

- Folder renamed on disk.
- Navigation updates.

### 7.13 Delete Folder

#### Purpose

Enable deletion of folders with confirmation.

#### User interaction

User deletes folder via UI.

#### Expected application flow

UI triggers Vault delete directory → Workspace updates navigation.

#### Components involved

UI, Vault, Workspace.

#### Domain layer responsibilities

Confirm deletion.

#### Application layer responsibilities

Coordinate navigation update.

#### Infrastructure responsibilities

Delete directory on disk.

#### UI update sequence

Remove folder from navigation.

#### Failure scenarios

Delete failure → Show error.

#### Edge cases

Deleting non-empty folders.

#### Manual testing

Delete folders, verify navigation.

#### Acceptance criteria

- Folder deleted on disk.
- Navigation updates.

### 7.14 Move Folder

#### Purpose

Support moving folders.

#### User interaction

User moves folder via UI.

#### Expected application flow

UI triggers Vault move directory → Workspace updates navigation.

#### Components involved

UI, Vault, Workspace.

#### Domain layer responsibilities

Validate move.

#### Application layer responsibilities

Coordinate navigation update.

#### Infrastructure responsibilities

Move directory on disk.

#### UI update sequence

Reflect new folder location.

#### Failure scenarios

Move failure → Show error.

#### Edge cases

Move conflicts.

#### Manual testing

Move folders, verify navigation.

#### Acceptance criteria

- Folder moved on disk.
- Navigation updates.

### 7.15 Assign Tags

#### Purpose

Allow assigning tags to documents.

#### User interaction

User adds tags via UI.

#### Expected application flow

Session updates metadata → SaveCoordinator persists → Vault updates.

#### Components involved

UI, DocumentSession, SaveCoordinator, Vault.

#### Domain layer responsibilities

Manage tags.

#### Application layer responsibilities

Coordinate save.

#### Infrastructure responsibilities

Persist changes.

#### UI update sequence

Show tags in UI.

#### Failure scenarios

Save failure → Show error.

#### Edge cases

Bulk tag assignment.

#### Manual testing

Assign tags, save, reload.

#### Acceptance criteria

- Tags persist and round-trip.

### 7.16 Remove Tags

#### Purpose

Allow removal of tags.

#### User interaction

User removes tags via UI.

#### Expected application flow

Session updates metadata → SaveCoordinator persists → Vault updates.

#### Components involved

UI, DocumentSession, SaveCoordinator, Vault.

#### Domain layer responsibilities

Manage tag removal.

#### Application layer responsibilities

Coordinate save.

#### Infrastructure responsibilities

Persist changes.

#### UI update sequence

Update tags display.

#### Failure scenarios

Save failure → Show error.

#### Edge cases

Removing non-existent tags.

#### Manual testing

Remove tags, save, reload.

#### Acceptance criteria

- Tag removal persists.

### 7.17 Templates

#### Purpose

Support applying templates to new documents.

#### User interaction

User applies template during document creation.

#### Expected application flow

TemplateService creates/populates document → SaveCoordinator persists → Vault updates.

#### Components involved

UI, TemplateService, DocumentSession, SaveCoordinator, Vault.

#### Domain layer responsibilities

Define template content.

#### Application layer responsibilities

Coordinate document creation and persistence.

#### Infrastructure responsibilities

Persist new document.

#### UI update sequence

Show new document with template content.

#### Failure scenarios

Creation failure → Show error.

#### Edge cases

Duplicate IDs.

#### Manual testing

Create documents with templates, verify content and IDs.

#### Acceptance criteria

- New document has template content.
- IDs are unique.

## 8. Phase 5 — Future Feature Readiness

### Objective

Prepare the architecture for future features by ensuring extensibility through data providers, application services, and view-model mappings without redesigning core rendering or persistence layers.

### Why this phase exists

Future features like Favorites, Archive, Smart Collections, and Templates require minimal core changes to avoid architectural churn.

### Current state

Core rendering, persistence, and editing pipelines are not fully stable or extensible.

### Target architecture

New features implement new query/data providers, application services, and view-model mappings. Specialized body components are added only when behavior differs.

### Files expected to change

- SaveCoordinator
- VaultFileSystem
- DocumentSession
- Workspace
- Application services and data providers

### Dependencies

Completion of Phases 1-4.

### Implementation strategy

1. Define new data providers for feature queries.
2. Add application services as needed.
3. Map view-models to UI components.
4. Add specialized body components only for behavioral differences.

### Risks

- Feature creep impacting core stability.
- Over-specialization of components.

### Validation strategy

- Review new features for adherence to architectural principles.
- Manual and automated testing of new features.

### Acceptance criteria

- New features require only new data providers, services, and view-model mappings.
- Core rendering and persistence remain untouched unless behavior differs.

**Checklist & Acceptance Criteria:**

- [ ] Adding a new query/data provider.
- [ ] Adding an application service if needed.
- [ ] View-model mapping.
- [ ] Specialized body component **only** if behavior differs from existing components.

**Files that should ideally remain untouched:**

- Core rendering pipeline (PageHost, TopBar, Description, etc.)
- SaveCoordinator
- VaultFileSystem
- DocumentSession
- Workspace

## 9. Architectural Constitution

1. **Never duplicate Layer-2 wrappers unless behavior differs.**  
   Duplication leads to maintenance overhead and inconsistent behavior.

2. **Never place business logic in React components.**  
   React components should be pure renderers; business logic belongs in domain or application layers.

3. **Never bypass SaveCoordinator for persistence.**  
   All saves must be coordinated to maintain consistency and error handling.

4. **Never bypass VaultFileSystem for file operations.**  
   VaultFileSystem is the single source of truth for durable file writes.

5. **Never derive stable identity from mutable paths or titles.**  
   Identity must be stable to avoid session duplication and data loss.

6. **Never introduce new rendering pipelines without clear behavioral differences.**  
   Avoid fragmentation and complexity by reusing existing pipelines unless behavior mandates new ones.

7. **Prefer data-driven rendering and composition over duplication.**  
   Compose UI from data models to maximize reuse and clarity.

## 10. Manual Validation Checklist

- [ ] Rendering: All page types render as expected.
- [ ] Editing: Markdown and metadata can be edited.
- [ ] Autosave: Edits persist automatically or on command.
- [ ] CRUD: All create, rename, delete, move, duplicate operations work.
- [ ] Navigation: Navigation state is accurate and updates as expected.
- [ ] Dirty state: Editing marks as dirty; saving clears dirty flag.
- [ ] Session reuse: Navigating to same document reuses session.
- [ ] Error handling: Save failures and other errors are surfaced and recoverable.
- [ ] Identity: Documents retain stable IDs across all operations.
- [ ] Serialization: Markdown and metadata round-trip without loss.

## 11. Definition of Done

Arc 5 is complete **only when:**

### Rendering Gate

- [ ] All duplicate UI components (TopBar, Description, etc.) are consolidated.
- [ ] PageHost contains a centralized page-type registry.
- [ ] Rendering is purely model-driven with no ad-hoc wrappers.
- [ ] Specialized components exist only when behavior differs concretely.
- [ ] Manual and automated tests confirm rendering correctness.

### Editing Gate

- [ ] DocumentSession lifecycle is clearly defined and implemented.
- [ ] Editing state is fully observable and reactive.
- [ ] Dirty state tracking is complete and reliable.
- [ ] Revision handling is implemented.
- [ ] Session reuse works without duplication.
- [ ] Close behavior for sessions is defined and tested.
- [ ] Save state notifications are implemented.
- [ ] Editing architecture is ready for undo/redo.
- [ ] Validation through unit, integration, and manual testing.

### Persistence Gate

- [ ] SaveCoordinator mediates all persistence operations.
- [ ] VaultFileSystem performs all durable file writes.
- [ ] Error handling is robust and user-visible.
- [ ] Dirty flags clear only after confirmed saves.
- [ ] Save failures retain local edits.
- [ ] Document identity is stable and consistent.
- [ ] Frontmatter serialization is accurate and reliable.
- [ ] Comprehensive testing of save flows under success and failure conditions.

### CRUD Gate

- [ ] All CRUD operations (Create, Rename, Delete, Move, Duplicate) are fully implemented with detailed flows.
- [ ] Metadata operations (Update Metadata, Favorite, Archive, Restore, Tags) are reliable.
- [ ] Folder operations (Create, Rename, Delete, Move) work correctly.
- [ ] Templates are supported with unique IDs and correct content.
- [ ] Manual testing confirms all flows behave correctly, including edge cases and failure scenarios.

### Architecture Gate

- [ ] All architectural principles and constitution rules are adhered to.
- [ ] No duplication or business logic leaks in UI components.
- [ ] Stable identity management is enforced.
- [ ] SaveCoordinator and VaultFileSystem are the sole persistence mechanisms.
- [ ] Rendering pipelines are consolidated and data-driven.
- [ ] Code reviews confirm architectural compliance.

### Future Feature Gate

- [ ] Architecture supports adding new features via data providers, application services, and view-model mappings.
- [ ] Core rendering and persistence layers remain stable and untouched unless behavior differs.
- [ ] New features can be added without redesigning foundational architecture.
- [ ] Validation through prototype implementations or design reviews.

---

This playbook guides engineers through the implementation and validation of Arc 5, ensuring the architecture is stable, extensible, and ready for future growth.
