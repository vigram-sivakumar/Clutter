# Arc 5 — Editing Architecture

## 1. Purpose

The Editing Architecture forms the foundational backbone for core editing functionalities in Clutter, including CRUD operations, autosave, undo/redo mechanisms, history tracking, conflict resolution, and support for future editor enhancements. While rendering concerns have been largely addressed in earlier phases, editing now emerges as the critical architectural challenge that must be robust, scalable, and extensible.

This phase intentionally does not solve UI rendering details, collaborative editing protocols, or advanced conflict resolution algorithms. Instead, it focuses on defining the architectural boundaries and responsibilities that enable these features to be built consistently and reliably in future development cycles.

## 2. Current Architecture

Clutter’s current editing implementation is organized around a repository pattern with several key components:

- **Workspace**: Owns navigation state only (active page/folder). It does not manage open documents or editing state.
- **DocumentRegistry**: Owns the lifetime of `DocumentSession` instances and guarantees one session per open document.
- **DocumentSession**: Represents an active editing session for a document, maintaining mutable state and transactions.
- **SaveCoordinator**: Coordinates the save lifecycle (begin save, saving state, completion, stale save protection). It does not perform persistence.
- **PersistenceService** (planned): Owns serialization, filesystem persistence through `VaultFileSystem`, Vault refresh/update, and completion of the save lifecycle.
- **Vault**: The canonical source of truth for persisted document data.
- **VaultFileSystem**: An abstraction layer over the underlying file system, responsible for reading and writing files.
- **PageHost**: Hosts the rendered output of documents.
- **ViewModel mappers**: Transform document state into UI-ready models.

Editing flows from user input into a DocumentSession through the Application layer. DocumentSession produces immutable revisions while SaveCoordinator tracks the save lifecycle. A dedicated PersistenceService (introduced in Arc 5) will serialize document data, write through VaultFileSystem, refresh the Vault, and finally notify SaveCoordinator that persistence completed.

Known gaps identified during Arc 5 validation include inconsistent dirty state propagation, insufficient transaction atomicity, lack of undo/redo infrastructure, and unclear boundaries between mutable and persisted state.

## 3. Responsibilities

### Workspace

- **Owns**: Navigation state only (active page/folder).
- **Does not own**: Document sessions or document content.
- **Responsibilities**: Manage navigation context.
- **What should never happen**: Workspace managing open documents or editing state.

### DocumentRegistry

- **Owns**: Metadata and indexing of documents, active session tracking.
- **Does not own**: Document content or persistence.
- **Responsibilities**: Provide lookup and lifecycle management for DocumentSessions.
- **Invariants**: Registry entries must accurately reflect active sessions.
- **What should never happen**: Registry holding stale or inconsistent session references.

### DocumentSession

- **Owns**: Mutable document state, transaction history, dirty state.
- **Does not own**: Persistence or file system access.
- **Responsibilities**: Manage editing operations, apply transactions, track revisions.
- **Invariants**: Document state must be consistent and observable; no direct Vault mutations.
- **What should never happen**: Editing bypassing DocumentSession or direct Vault writes.

### SaveCoordinator

- **Owns**: Save lifecycle only.
- **Does not own**: Serialization, filesystem access, Vault updates, retries, business logic.
- **Responsibilities**: Begin save, track active saves, complete save, protect against stale save completion.
- **What should never happen**: Concurrent conflicting saves or lost updates.

### PersistenceService (Planned)

- **Owns**: Serialization, VaultFileSystem interaction, Vault refresh/update, and calling `SaveCoordinator.completeSave()` after successful persistence.
- **Does not own**: Document editing.

### Vault

- **Owns**: Canonical persisted document data.
- **Does not own**: Editing state or UI.
- **Responsibilities**: Serve as authoritative source for document contents.
- **Invariants**: Vault state must be immutable from editing perspective.
- **What should never happen**: Direct edits applied to Vault outside SaveCoordinator.

### VaultFileSystem

- **Owns**: File system abstraction for reading and writing.
- **Does not own**: Document state or editing logic.
- **Responsibilities**: Perform actual I/O operations reliably.
- **Invariants**: File system operations must be atomic and consistent.
- **What should never happen**: Partial writes or corrupted persistence.

### React/UI

- **Owns**: Presentation and interaction layers.
- **Does not own**: Editing state or persistence.
- **Responsibilities**: Render ViewModels, dispatch user input as editing commands.
- **Invariants**: UI state must be derived from DocumentSession or ViewModel mappers.
- **What should never happen**: UI maintaining independent mutable editing state.

## 4. Editing Lifecycle

- **Open Document**: User initiates editing; Workspace checks DocumentRegistry.
- **Reuse Existing Session or Create One**: If a DocumentSession exists, reuse it; else create a new session to maintain state consistency.
- **User Edits**: Input is transformed into DocumentTransactions applied within the DocumentSession.
- **DocumentTransaction**: Encapsulates atomic changes ensuring consistency and observability.
- **DocumentSession.commit()**
- **SaveCoordinator.beginSave()**
- **PersistenceService**
- **FrontmatterSerializer**
- **VaultFileSystem**
- **Vault refresh/update**
- **SaveCoordinator.completeSave()**
- **UI Refresh**: PageHost and ViewModel mappers re-render updated content.

SaveCoordinator coordinates the save lifecycle while PersistenceService performs the actual persistence.

Each step exists to maintain clear separation of concerns, ensure data integrity, and provide responsive user experience while enabling robust persistence.

## 5. DocumentSession

DocumentSession exists to isolate mutable editing state from the immutable persisted Vault. Editing never occurs directly against the Vault to prevent data corruption and ensure transactional integrity.

- **Revision Model**: Tracks discrete document versions for history and potential undo/redo.
- **Dirty State**: Flags unsaved changes, triggering persistence workflows.
- **Observability**: Exposes state changes to UI and SaveCoordinator.
- **Lifecycle**: Created on document open, destroyed on close; maintains session consistency.
- **Future Undo/Redo**: DocumentTransactions provide foundation for reversible operations.
- **Collaborative Editing**: Session isolation allows layering of concurrency protocols without Vault interference.

## 6. Save Lifecycle

- SaveCoordinator coordinates save state only.
- PersistenceService performs serialization and filesystem writes.
- VaultFileSystem performs low-level I/O.
- SaveCoordinator completes the lifecycle after persistence succeeds.
- This separation keeps the engine independent of infrastructure.

## 7. Editing Rules

- **DocumentSession is the only mutable document**: Centralizes editing state to maintain consistency.
- **Vault is never edited directly**: Preserves Vault as immutable source of truth.
- **SaveCoordinator is the only save lifecycle coordinator.**
- **PersistenceService is the only component allowed to serialize documents and invoke VaultFileSystem for document persistence.**
- **React never owns editing state**: Keeps UI stateless and reactive to session changes.
- **Workspace never owns document contents**: Limits workspace to session management only.

Each rule enforces architectural boundaries that prevent state corruption, race conditions, and inconsistent user experiences.

## 8. Validation

Validation combines manual code reviews, architectural walkthroughs, and automated tests to ensure:

- Dirty states propagate correctly.
- Transactions apply atomically.
- SaveCoordinator enforces single save pipelines.
- UI reflects session state accurately.
- No direct Vault mutations occur.
- DocumentSessions lifecycle is respected.

This rigorous validation guarantees adherence to architectural principles and readiness for future extensions.

## 9. Definition of Done

The editing architecture is considered complete when:

- All editing flows operate exclusively through DocumentSessions.
- SaveCoordinator correctly coordinates the save lifecycle.
- PersistenceService correctly serializes and persists documents through VaultFileSystem.
- Vault remains immutable outside SaveCoordinator.
- UI reflects document state solely via ViewModels derived from sessions.
- Dirty state and revision tracking function correctly.
- Undo/redo infrastructure scaffolding is in place.
- Manual and automated validations pass consistently.
- Documentation fully captures responsibilities, lifecycle, and rules.

Only upon meeting these criteria can the editing architecture be deemed stable, maintainable, and extensible for Clutter’s evolving needs.
