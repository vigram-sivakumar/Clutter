# Arc 5 — CRUD Architecture

## 1. Purpose

CRUD (Create, Read, Update, Delete) is the first major consumer of the architecture specified in previous Arc 5 documents for Clutter. It is intended to validate and exercise the architectural boundaries, ensuring that the foundational abstractions—such as Application Services, DocumentSession, SaveCoordinator, PersistenceService (planned), Vault, and rendering—work cohesively for real-world use cases. CRUD should not introduce new architectural concepts, but instead, stress-test and refine the established ones by serving as the canonical example of how business logic and persistence interact.

CRUD operations are the primary means by which users manipulate their workspace. Each operation flows through the architecture, touching key layers:

- **DocumentSession**: Owns and manages all mutable in-memory state for the active workspace.
- **SaveCoordinator**: Coordinates the save lifecycle only.
- **PersistenceService** (planned): Performs document serialization, filesystem persistence through `VaultFileSystem`, Vault refresh/update, and completes the save lifecycle.
- **Vault**: The durable, canonical source of truth for all workspace data.
- **Rendering/UI**: Reacts to state updates, never drives persistence or business logic directly.

## 2. CRUD Philosophy

The following principles guide CRUD in Clutter:

- **Uniform Pipeline**: Every CRUD operation flows through the same architectural pipeline, ensuring consistency and predictability.
- **Business Logic in Application Services**: All business logic, including validation and orchestration, lives in Application Services—never in UI or persistence layers.
- **State Ownership**: The DocumentSession is the sole owner of all mutable workspace state.
- **Save Lifecycle Ownership**: SaveCoordinator coordinates the save lifecycle.
- **Persistence Ownership**: PersistenceService exclusively performs serialization and filesystem persistence.
- **Vault as Source of Truth**: The Vault represents the durable, persisted state of the workspace. All reads and writes must be mediated through the Vault, never bypassed.
- **Reactive Rendering**: UI rendering responds to state changes; it does not initiate persistence or mutate state directly.

## 3. Generic CRUD Pipeline

All CRUD operations follow this lifecycle:

**User Action → Application Service → Validation → DocumentSession/Domain → SaveCoordinator.beginSave() → PersistenceService → FrontmatterSerializer → VaultFileSystem → Vault Refresh/Update → SaveCoordinator.completeSave() → Workspace/UI Update**

**Stages:**

- **User Action**: Initiated by user intent (e.g., button press, context menu).
- **Application Service**: Receives the action, performs business logic, validation, and orchestrates the operation.
- **Validation**: Ensures preconditions are met (e.g., page exists, name is valid).
- **DocumentSession/Domain**: Applies the mutation to in-memory state.
- **SaveCoordinator.beginSave()**: Begins the save lifecycle, coordinating the start of persistence.
- **PersistenceService**: Performs serialization and filesystem persistence, orchestrating the actual save by invoking the FrontmatterSerializer and VaultFileSystem.
- **FrontmatterSerializer**: Produces canonical Markdown for persisted documents.
- **VaultFileSystem**: Performs low-level I/O, writing to or manipulating files and directories.
- **Vault Refresh/Update**: Updates the Vault’s durable state, synchronizes with DocumentSession.
- **SaveCoordinator.completeSave()**: Completes the save lifecycle after persistence succeeds.
- **Workspace/UI Update**: UI reacts to updated state; renders changes.

Each stage exists to enforce separation of concerns, ensure testability, and provide clear boundaries for error handling and recovery.

## 4. CRUD Operation Specifications

Below, each operation details its objective, current and target architecture, preconditions, flow, involved layers, expected effects, failure handling, and validation.

### 4.1 Create Page

- **Objective**: Add a new page to the workspace in a specified folder.
- **Current State**: Pages exist as files in the Vault; creation is manual or ad hoc.
- **Target Architecture**: Application Service receives the request, validates the folder, generates a unique page ID, and updates DocumentSession. SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault refreshes, and UI updates.
- **Preconditions**: Target folder exists; name is valid and not duplicate.
- **Flow**:
  1. User triggers "Create Page".
  2. Application Service validates target folder and name.
  3. DocumentSession adds page to in-memory structure.
  4. SaveCoordinator begins the save lifecycle.
  5. PersistenceService performs serialization and filesystem persistence.
  6. Vault updates and notifies DocumentSession.
  7. UI reflects new page.
- **Layers**: Application Service, DocumentSession, SaveCoordinator, PersistenceService, Vault, UI.
- **Filesystem**: New file created in correct folder.
- **Vault Update**: Adds new page entry.
- **UI Update**: Page appears in navigation and workspace.
- **Failure**: Name conflict, I/O error, invalid folder.
- **Manual Validation**: Create page in UI, confirm file and UI update.
- **Acceptance Criteria**: New page exists in Vault and UI; no duplicate; error scenarios handled.

### 4.2 Rename Page

- **Objective**: Change the name of an existing page.
- **Current State**: Manual file rename.
- **Target Architecture**: Application Service validates new name, updates DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault updates, UI reflects change.
- **Preconditions**: Page exists; new name is valid and unique.
- **Flow**:
  1. User triggers rename.
  2. Application Service validates.
  3. DocumentSession updates name.
  4. SaveCoordinator begins the save lifecycle.
  5. PersistenceService performs serialization and filesystem persistence.
  6. Vault refreshes.
  7. UI updates.
- **Layers**: All.
- **Filesystem**: File rename.
- **Vault Update**: Page metadata updated.
- **UI Update**: Name change reflected.
- **Failure**: Name conflict, I/O error.
- **Manual Validation**: Rename via UI, check file and UI.
- **Acceptance Criteria**: Name updated everywhere, no duplicates, errors surfaced.

### 4.3 Delete Page

- **Objective**: Remove a page from workspace.
- **Current State**: Manual file deletion.
- **Target Architecture**: Application Service validates, DocumentSession removes page, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault updates, UI reflects removal.
- **Preconditions**: Page exists; not locked.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Layers**: All.
- **Filesystem**: File deleted.
- **Vault Update**: Page entry removed.
- **UI Update**: Page disappears.
- **Failure**: I/O error, page locked.
- **Manual Validation**: Delete in UI, confirm removal.
- **Acceptance Criteria**: Page gone in Vault and UI; errors handled.

### 4.4 Move Page

- **Objective**: Move page to another folder.
- **Current State**: Manual file move.
- **Target Architecture**: Validate target, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Page and target folder exist.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: File moved.
- **Vault Update**: Updated location.
- **UI Update**: Page repositions.
- **Failure**: Name conflict, I/O error.
- **Manual Validation**: Move page, confirm.
- **Acceptance Criteria**: Correct location, no duplicates.

### 4.5 Duplicate Page

- **Objective**: Create a copy of an existing page.
- **Current State**: Manual copy.
- **Target Architecture**: Validate, copy in DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Source page exists.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: New file created.
- **Vault Update**: New page entry.
- **UI Update**: Duplicate appears.
- **Failure**: Name conflict, I/O error.
- **Manual Validation**: Duplicate and verify.
- **Acceptance Criteria**: Both pages exist, no conflict.

### 4.6 Update Markdown

- **Objective**: Edit the markdown content of a page.
- **Current State**: Manual edit.
- **Target Architecture**: Application Service validates, DocumentSession updates in-memory content, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Page exists.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: File content updated.
- **Vault Update**: Content updated.
- **UI Update**: Changes reflected.
- **Failure**: I/O error.
- **Manual Validation**: Edit and verify.
- **Acceptance Criteria**: Content matches, error handled.

### 4.7 Update Metadata

- **Objective**: Change metadata (e.g., title, tags).
- **Current State**: Manual or ad hoc.
- **Target Architecture**: Validate, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Page exists.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Metadata updated.
- **Vault Update**: Metadata reflects change.
- **UI Update**: Metadata shown.
- **Failure**: Invalid data, I/O error.
- **Manual Validation**: Update via UI.
- **Acceptance Criteria**: Metadata consistent.

### 4.8 Favorite

- **Objective**: Mark a page as favorite.
- **Current State**: Not implemented.
- **Target Architecture**: Application Service toggles favorite in DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Page exists.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Metadata change.
- **Vault Update**: Favorite flag.
- **UI Update**: Favorite state shown.
- **Failure**: I/O error.
- **Manual Validation**: Favorite/unfavorite.
- **Acceptance Criteria**: State matches.

### 4.9 Archive

- **Objective**: Mark a page as archived.
- **Current State**: Not implemented.
- **Target Architecture**: Application Service sets archive flag, DocumentSession updates, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Page exists.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Metadata or move to archive folder.
- **Vault Update**: Archive flag.
- **UI Update**: Archive section.
- **Failure**: I/O error.
- **Manual Validation**: Archive/unarchive.
- **Acceptance Criteria**: State reflects archive.

### 4.10 Restore

- **Objective**: Restore a page from archive.
- **Current State**: Not implemented.
- **Target Architecture**: Application Service clears archive flag, DocumentSession updates, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Page is archived.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Metadata or move out of archive.
- **Vault Update**: Archive flag cleared.
- **UI Update**: Page returns.
- **Failure**: I/O error.
- **Manual Validation**: Restore and verify.
- **Acceptance Criteria**: Page reappears.

### 4.11 Create Folder

- **Objective**: Add a new folder.
- **Current State**: Manual creation.
- **Target Architecture**: Validate, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Parent exists; name valid.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: New directory.
- **Vault Update**: Folder entry.
- **UI Update**: Folder shown.
- **Failure**: Name conflict, I/O error.
- **Manual Validation**: Create and verify.
- **Acceptance Criteria**: Folder exists.

### 4.12 Rename Folder

- **Objective**: Change folder name.
- **Current State**: Manual rename.
- **Target Architecture**: Validate, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Folder exists; name valid.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Directory rename.
- **Vault Update**: Folder metadata.
- **UI Update**: Name change.
- **Failure**: Name conflict, I/O error.
- **Manual Validation**: Rename and verify.
- **Acceptance Criteria**: Folder renamed.

### 4.13 Delete Folder

- **Objective**: Remove folder and contents.
- **Current State**: Manual delete.
- **Target Architecture**: Validate, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Folder exists; not root.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Directory and contents deleted.
- **Vault Update**: Folder and contents removed.
- **UI Update**: Folder disappears.
- **Failure**: I/O error, not empty.
- **Manual Validation**: Delete and verify.
- **Acceptance Criteria**: Folder and contents gone.

### 4.14 Move Folder

- **Objective**: Move folder to another location.
- **Current State**: Manual move.
- **Target Architecture**: Validate, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Source and target exist.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Directory moved.
- **Vault Update**: Folder location updated.
- **UI Update**: Folder repositions.
- **Failure**: Name conflict, I/O error.
- **Manual Validation**: Move and verify.
- **Acceptance Criteria**: Folder in new location.

### 4.15 Assign Tags

- **Objective**: Add tags to page or folder.
- **Current State**: Not implemented.
- **Target Architecture**: Validate, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Target exists.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Metadata update.
- **Vault Update**: Tags added.
- **UI Update**: Tags shown.
- **Failure**: Invalid tags, I/O error.
- **Manual Validation**: Assign and verify.
- **Acceptance Criteria**: Tags present.

### 4.16 Remove Tags

- **Objective**: Remove tags from page or folder.
- **Current State**: Not implemented.
- **Target Architecture**: Validate, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Tag assigned.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Metadata update.
- **Vault Update**: Tags removed.
- **UI Update**: Tags disappear.
- **Failure**: Tag not assigned, I/O error.
- **Manual Validation**: Remove and verify.
- **Acceptance Criteria**: Tags gone.

### 4.17 Create Template

- **Objective**: Save a page as a reusable template.
- **Current State**: Not implemented.
- **Target Architecture**: Validate, update DocumentSession, SaveCoordinator begins the save lifecycle. PersistenceService performs serialization and filesystem persistence. Vault and UI update.
- **Preconditions**: Page exists.
- **Flow**: As above, with SaveCoordinator beginning the save lifecycle and PersistenceService performing serialization and filesystem persistence.
- **Filesystem**: Template file created.
- **Vault Update**: Template entry.
- **UI Update**: Template listed.
- **Failure**: Name conflict, I/O error.
- **Manual Validation**: Create and verify.
- **Acceptance Criteria**: Template available.

## 5. Common Rules

Every CRUD operation must follow these rules:

- **No Bypassing Application Services**: All business logic flows through Application Services.
- **No Direct Vault Writes**: All persistence is mediated by PersistenceService.
- **SaveCoordinator never performs filesystem I/O.**
- **PersistenceService is the only component allowed to serialize documents and invoke VaultFileSystem.**
- **No React Persistence**: UI never initiates persistence or mutates state directly.
- **Consistent End State**: After a successful operation, Vault and UI must be in sync and reflect the intended change.

## 6. CRUD Readiness Matrix

| Operation       | Domain Ready | Editing Ready | Persistence Ready | Rendering Ready | Remaining Work                |
| --------------- | ------------ | ------------- | ----------------- | --------------- | ----------------------------- |
| Create Page     | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Define flow, error handling   |
| Rename Page     | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Validation, conflicts         |
| Delete Page     | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Confirmation, undo            |
| Move Page       | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Nested moves, conflicts       |
| Duplicate Page  | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Name generation, UI feedback  |
| Update Markdown | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Live sync, conflict handling  |
| Update Metadata | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Schema, validation            |
| Favorite        | Placeholder  | Placeholder   | Placeholder       | Placeholder     | State propagation             |
| Archive         | Placeholder  | Placeholder   | Placeholder       | Placeholder     | UI sections, undo             |
| Restore         | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Conflict on restore           |
| Create Folder   | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Nested structures             |
| Rename Folder   | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Path updates, conflicts       |
| Delete Folder   | Placeholder  |               | Placeholder       | Placeholder     | Placeholder                   | Recursive delete, undo |
| Move Folder     | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Cycles, conflicts             |
| Assign Tags     | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Tag schema, autocomplete      |
| Remove Tags     | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Tag removal, UI feedback      |
| Create Template | Placeholder  | Placeholder   | Placeholder       | Placeholder     | Template catalog, application |

## 7. Future Feature Mapping

Features such as Favorites, Archive, Recent, Templates, Smart Collections, and Search must reuse the CRUD pipeline. They should not introduce alternate flows or bypass Application Services, DocumentSession, SaveCoordinator, PersistenceService, or VaultFileSystem. Instead, they should layer new business logic on top of the same operation lifecycle, ensuring architectural consistency and reusability.

## 8. Validation Strategy

**Architectural Validation**: Ensure every CRUD operation flows through the prescribed layers (Application Service → DocumentSession → SaveCoordinator → PersistenceService → Vault).

**Integration Validation**: Test that state changes propagate correctly from user action to UI and are durable in the Vault.

**Manual Validation**: End-to-end user testing of each CRUD operation, including error and edge cases, ensuring that Vault and UI are always consistent.

## 9. Definition of Done

CRUD architecture is considered complete and stable when:

- Every CRUD operation flows through Application Services, DocumentSession, SaveCoordinator, PersistenceService, and Vault as specified.
- No operation bypasses architectural boundaries.
- All error scenarios are handled gracefully, with consistent Vault and UI state.
- All operations are covered by integration and manual tests.
- Future features (e.g., Smart Collections, Search) can be implemented by composing or extending CRUD flows, not by altering the architecture.
- Documentation and readiness matrix are up to date, with clear tracking of remaining work.

Once these gates are met, CRUD architecture is validated, and future development should focus on business logic and user experience, not core architectural changes.
