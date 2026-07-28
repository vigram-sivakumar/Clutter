# Arc 5 — Persistence Architecture

## 1. Purpose

Persistence in Clutter serves as the critical bridge between the mutable editing environment represented by the `DocumentSession` and the durable, Markdown-based storage embodied by the `Vault`. This phase of the architecture is responsible for guaranteeing **durability**, **consistency**, and **identity preservation** of documents as users interact with their content.

Persistence ensures that user changes are reliably saved to disk in a way that reflects the authoritative Markdown source, while maintaining the integrity and traceability of documents across edits, renames, moves, and imports.

Importantly, this architecture **does not** address cloud synchronization, real-time collaboration, or conflict resolution across multiple clients. These concerns are out of scope for this phase and will be treated separately.

---

## 2. Current Architecture

The current persistence implementation in Clutter is composed of the following repository concepts:

- **Vault**: Represents the snapshot of all Markdown documents and folders on disk. It is conceptually immutable and reflects the last known persisted state.
- **VaultBuilder**: Responsible for constructing the initial `Vault` snapshot by scanning the filesystem.
- **VaultScanner**: Traverses the filesystem to discover Markdown files and folders, feeding data to the `VaultBuilder`.
- **VaultFileSystem**: The abstraction layer owning all filesystem access, including reading, writing, renaming, deleting, and moving files and directories.
- **SaveCoordinator**: Coordinates the save lifecycle (begin save, saving state, completion, stale save protection). It does not perform serialization or filesystem persistence.
- **PersistenceService** (planned): Owns document serialization, filesystem persistence through `VaultFileSystem`, Vault refresh/update, and notifies `SaveCoordinator` when persistence completes.
- **DocumentSession**: The mutable in-memory buffer where users edit document content and metadata before persistence.
- **DocumentRegistry**: Maintains the mapping between document identities and their in-memory representations.
- **IdentityResolver**: Responsible for generating, resolving, and maintaining stable IDs for documents across persistence events.
- **FrontmatterSerializer**: Handles serialization and deserialization of YAML frontmatter in Markdown files.

### What currently works

- Basic loading of Markdown files into `DocumentSession` buffers.
- The editing pipeline can begin the save lifecycle through `SaveCoordinator`.
- Filesystem persistence through a dedicated `PersistenceService` is planned.
- Scanning and building initial `Vault` snapshots.
- Serialization of frontmatter and Markdown content.

### Known gaps discovered during Arc 5 validation

- **No-op SaveCoordinator**: The current SaveCoordinator implementation is a placeholder and does not fully coordinate persistence workflows.
- **Path-based fallback IDs**: IdentityResolver currently falls back to using file paths as IDs, which is unsafe for renames and moves.
- **Serializer limitations**: FrontmatterSerializer does not fully support multiline values, arrays, or deterministic ordering.
- **Missing delete API**: There is no dedicated API for deleting documents or folders in the VaultFileSystem.
- **Vault mutation strategy**: Vault updates after persistence are not fully defined; mutation is ad hoc and risks inconsistency.

---

## 3. Persistence Principles

The persistence architecture is founded on the following principles:

- **Markdown is the source of truth**: The persisted Markdown files on disk represent the definitive state of documents.
- **Vault is an immutable snapshot**: The Vault reflects a consistent snapshot of the persisted filesystem state at a point in time.
- **DocumentSession is the mutable buffer**: All user edits occur in the DocumentSession before being committed to persistence.
- **SaveCoordinator is the single save lifecycle coordinator.**: All save operations pass through the SaveCoordinator to ensure consistency and coordination.
- **PersistenceService is the single persistence entry point** responsible for serialization, filesystem writes, Vault refresh/update, and completing the save lifecycle.
- **VaultFileSystem owns all filesystem access**: Direct filesystem operations are encapsulated within VaultFileSystem to isolate side effects.
- **Identity must survive rename and move**: Document identities are stable and independent of file paths to preserve continuity.
- **Persistence must be deterministic and recoverable**: Saves are deterministic to avoid corruption and support recovery from failures.

---

## 4. Persistence Lifecycle

The persistence lifecycle in Clutter proceeds through the following stages:

1. **Open**  
   The VaultScanner scans the filesystem, and VaultBuilder constructs a Vault snapshot. Documents are loaded into DocumentSessions with resolved identities.  
   _Ownership_: VaultScanner, VaultBuilder, IdentityResolver.

2. **Edit**  
   Users modify document content and metadata in the DocumentSession buffer.  
   _Ownership_: DocumentSession.

3. **Commit**  
   The user or autosave triggers a commit, signaling that the DocumentSession's state should be persisted.  
   _Ownership_: DocumentSession initiates, SaveCoordinator manages.

4. **Save Request**  
   `SaveCoordinator.beginSave()` marks the session as entering the save lifecycle.  
   _Ownership_: SaveCoordinator.

5. **PersistenceService**  
   Receives the committed revision that should be persisted and coordinates the persistence workflow.  
   _Ownership_: PersistenceService.

6. **Serialization**  
   `FrontmatterSerializer` converts the document into canonical Markdown.  
   _Ownership_: FrontmatterSerializer.

7. **VaultFileSystem**  
   Performs the low-level filesystem operation.  
   _Ownership_: VaultFileSystem.

8. **Vault Refresh / Update**  
   Refreshes or updates the immutable Vault snapshot.  
   _Ownership_: Vault, VaultBuilder.

9. **Save Completion**  
   `PersistenceService` calls `SaveCoordinator.completeSave()` after successful persistence.  
   _Ownership_: PersistenceService, SaveCoordinator.

10. **UI Refresh**  
    The UI reflects the persisted state.  
    _Ownership_: UI layer (outside persistence scope).

SaveCoordinator owns the save lifecycle only.
PersistenceService owns persistence.
This separation keeps the editing engine independent of infrastructure while allowing persistence to evolve independently.

Each step exists to maintain separation of concerns, ensure consistency, and isolate side effects.

---

## 5. Responsibilities

### DocumentSession

- **Owns**: Mutable in-memory representation of document content and metadata.
- **Does not own**: Persistence, serialization, or filesystem interaction.
- **Responsibilities**: Provide an editable buffer, track changes, and expose commit triggers.
- **Invariants**: DocumentSession state must be consistent and reflect user edits.
- **Failure boundaries**: Errors in DocumentSession do not affect persistence directly.
- **What should never happen**: Persisting data directly from DocumentSession without SaveCoordinator.

### SaveCoordinator

- **Owns**: Save lifecycle only.
- **Does not own**: Serialization, filesystem access, Vault updates, retries, or business workflows.
- **Responsibilities**:
  - Begin save.
  - Track active saves.
  - Complete save.
  - Prevent stale save completion.
- **Invariants**:
  - Only one active save per document revision.
- **Failure boundaries**:
  - Coordinates lifecycle only.
- **What should never happen**:
  - Direct filesystem access.
  - Serialization.
  - Vault mutation.

### PersistenceService (Planned)

- **Owns**:
  - Serialization.
  - VaultFileSystem interaction.
  - Vault refresh/update.
  - Calling `SaveCoordinator.completeSave()` after successful persistence.
- **Does not own**:
  - Editing state.
  - Document lifecycle.
- **Responsibilities**:
  - Convert document state into persisted Markdown.
  - Persist through VaultFileSystem.
  - Refresh or update the Vault.
  - Complete the save lifecycle.
- **Invariants**:
  - Filesystem writes happen only here.
- **What should never happen**:
  - Mutating DocumentSession.

### VaultFileSystem

- **Owns**: All filesystem operations (read, write, rename, delete, move).
- **Does not own**: Serialization or identity resolution.
- **Responsibilities**: Provide a consistent, atomic interface to the filesystem.
- **Invariants**: Filesystem state must be consistent after operations.
- **Failure boundaries**: Must detect and report filesystem errors.
- **What should never happen**: Silent data loss or corruption due to filesystem operations.

### FrontmatterSerializer

- **Owns**: Serialization and deserialization of YAML frontmatter and Markdown content.
- **Does not own**: Persistence coordination or identity.
- **Responsibilities**: Produce deterministic, compatible Markdown files with embedded metadata.
- **Invariants**: Serialization must be reversible and deterministic.
- **Failure boundaries**: Must detect malformed frontmatter and report errors.
- **What should never happen**: Data loss or corruption during serialization.

### IdentityResolver

- **Owns**: Generation and resolution of stable document IDs.
- **Does not own**: Persistence or serialization.
- **Responsibilities**: Maintain stable IDs across renames, moves, and imports.
- **Invariants**: IDs must be unique, stable, and independent of file paths.
- **Failure boundaries**: Must handle missing or corrupted IDs gracefully.
- **What should never happen**: ID collisions or identity loss.

### Vault

- **Owns**: Immutable snapshot of persisted documents and folders.
- **Does not own**: Mutable editing or persistence operations.
- **Responsibilities**: Represent the persisted state, provide lookup by ID.
- **Invariants**: Vault state must accurately reflect the filesystem snapshot.
- **Failure boundaries**: Vault updates must be atomic and consistent.
- **What should never happen**: Vault state diverging from actual persisted data.

---

## 6. Identity Strategy

Stable identity is paramount for persistence correctness. The architecture mandates:

- **Stable IDs**: Each document must have a unique, persistent identifier that survives renames and moves.
- **Why path-derived IDs are unsafe**: File paths change frequently; using paths as IDs risks identity loss and data corruption.
- **Rename and Move**: IdentityResolver must preserve document IDs when files or folders are renamed or moved within the Vault.
- **Imported Markdown without IDs**: Documents imported from external sources may lack IDs; IdentityResolver must generate new stable IDs without collisions.
- **ID generation policy**: IDs should be globally unique, non-guessable, and stored within the document metadata (e.g., frontmatter).
- **Identity migration strategy**: Legacy documents with path-based or missing IDs must be migrated to stable IDs on first load or save.

This strategy ensures continuity of document identity, enabling robust persistence and future features like collaboration.

---

## 7. Serialization Strategy

Serialization must treat Markdown and frontmatter as follows:

- **Metadata ownership**: Frontmatter exclusively owns document metadata such as IDs, tags, and configuration.
- **Escaping**: Special characters in YAML must be properly escaped to avoid parse errors.
- **Arrays and multiline values**: Arrays and multiline strings must be serialized in standard YAML format to preserve semantics.
- **Ordering**: Frontmatter keys should be serialized in a deterministic order for consistency and diffability.
- **Deterministic serialization**: Serialization output must be stable across saves to minimize unnecessary diffs.
- **Future compatibility**: The serializer must be extensible to support new metadata types without breaking existing files.

This approach ensures the Markdown files remain human-readable, editable outside Clutter, and compatible with other tools.

---

## 8. CRUD Persistence Flows

### Create

- **Persistence flow**: DocumentSession creates new content → SaveCoordinator begins the save lifecycle. PersistenceService performs serialization through FrontmatterSerializer, persists using VaultFileSystem, refreshes the Vault, and completes the save lifecycle.
- **Filesystem interaction**: Write new Markdown file atomically.
- **Snapshot update**: VaultBuilder adds new document snapshot.
- **Failure handling**: Rollback partial writes; report errors.
- **Validation**: Confirm file creation and ID uniqueness.

### Rename

- **Persistence flow**: DocumentSession updates path → SaveCoordinator begins the save lifecycle. PersistenceService coordinates the rename through VaultFileSystem, refreshes the Vault, and completes the save lifecycle.
- **Filesystem interaction**: Atomic rename operation.
- **Snapshot update**: VaultBuilder updates path and preserves ID.
- **Failure handling**: Revert rename on failure.
- **Validation**: Check for destination conflicts.

### Delete

- **Persistence flow**: SaveCoordinator begins the save lifecycle. PersistenceService requests the delete through VaultFileSystem, refreshes the Vault, and completes the save lifecycle.
- **Filesystem interaction**: Remove file(s) atomically.
- **Snapshot update**: VaultBuilder removes document snapshot.
- **Failure handling**: Fail gracefully if file missing.
- **Validation**: Confirm deletion complete.

### Move

- **Persistence flow**: Similar to rename but across folders.
- **Filesystem interaction**: Atomic move operation.
- **Snapshot update**: VaultBuilder updates paths, preserves IDs.
- **Failure handling**: Rollback on failure.
- **Validation**: Check folder existence and conflicts.

### Duplicate

- **Persistence flow**: DocumentSession clones content → SaveCoordinator begins the save lifecycle. PersistenceService performs serialization through FrontmatterSerializer with a new ID, persists using VaultFileSystem, refreshes the Vault, and completes the save lifecycle.
- **Filesystem interaction**: Write new file.
- **Snapshot update**: Add new document snapshot.
- **Failure handling**: Rollback partial writes.
- **Validation**: Ensure new ID uniqueness.

### Update Markdown

- **Persistence flow**: DocumentSession edits content → SaveCoordinator begins the save lifecycle. PersistenceService performs serialization through FrontmatterSerializer, persists using VaultFileSystem, refreshes the Vault, and completes the save lifecycle.
- **Filesystem interaction**: Overwrite file atomically.
- **Snapshot update**: Update document snapshot.
- **Failure handling**: Preserve previous version on failure.
- **Validation**: Confirm file integrity.

### Update Metadata

- **Persistence flow**: DocumentSession edits frontmatter → SaveCoordinator begins the save lifecycle. PersistenceService performs serialization through FrontmatterSerializer, persists using VaultFileSystem, refreshes the Vault, and completes the save lifecycle.
- **Filesystem interaction**: Overwrite file atomically.
- **Snapshot update**: Update metadata snapshot.
- **Failure handling**: Validate frontmatter correctness.
- **Validation**: Parse frontmatter after save.

### Folder Operations

- **Persistence flow**: Create, rename, move, delete folders via VaultFileSystem → Vault updated.
- **Filesystem interaction**: Atomic folder operations.
- **Snapshot update**: Update folder snapshots.
- **Failure handling**: Rollback on failure.
- **Validation**: Check folder structure consistency.

---

## 9. Error Handling

The architecture handles errors as follows:

- **Save failures**: SaveCoordinator manages save lifecycle state; PersistenceService reports errors and retries can be triggered; partial writes are rolled back or quarantined.
- **Partial writes**: Filesystem writes are atomic where possible; temporary files and rename-on-write patterns prevent corruption.
- **Rename conflicts**: PersistenceService validates destination paths before rename; conflicts abort operation with error.
- **Missing files**: VaultScanner detects missing files and updates Vault accordingly; missing files during save trigger error.
- **Corrupted frontmatter**: FrontmatterSerializer detects parse errors; corrupted files are flagged for user intervention.
- **Recovery strategy**: On error, persistence operations are aborted cleanly; Vault state is rolled back to last consistent snapshot; user is notified.

PersistenceService owns retries, rollback, persistence failures, filesystem recovery, and serialization failures.

This robust error handling ensures data integrity and user awareness.

---

## 10. Validation

Persistence should be validated through:

- **Manual testing**: Create, rename, move, delete, duplicate, and update documents and folders; verify Vault snapshot consistency and filesystem state.
- **Automated tests**: Unit and integration tests for serialization, identity resolution, filesystem operations, and SaveCoordinator lifecycle coordination and PersistenceService workflows.
- **Consistency checks**: Vault snapshots must be consistent with filesystem contents; identity mappings verified.
- **Failure injection**: Simulate save failures, partial writes, rename conflicts, and corrupted frontmatter to ensure graceful recovery.
- **Performance benchmarks**: Validate save latency and Vault refresh performance under load.

Validation ensures persistence correctness and readiness for production use.

---

## 11. Definition of Done

Persistence architecture is considered complete and ready for CRUD, autosave, and future features when:

- All CRUD operations (Create, Read, Update, Delete) are fully supported with atomic, consistent persistence flows.
- IdentityResolver guarantees stable, collision-free IDs across all operations.
- SaveCoordinator reliably coordinates the save lifecycle.
- PersistenceService reliably serializes documents, persists through VaultFileSystem, refreshes the Vault, and completes the save lifecycle.
- VaultFileSystem encapsulates all filesystem side effects with atomic operations.
- FrontmatterSerializer produces deterministic, reversible serialization supporting complex metadata.
- Vault snapshots accurately reflect persisted filesystem state and update atomically.
- Comprehensive validation and testing demonstrate durability, consistency, and recoverability.
- APIs exist for all persistence operations including delete and folder management.
- The system gracefully handles errors without data loss or corruption.
- Performance meets user experience requirements for autosave and interactive editing.

Only after meeting these criteria should the persistence architecture be considered production-ready and serve as a foundation for advanced features like collaboration and cloud sync.

---

## After this document

The architecture becomes internally consistent:

```
DocumentSession
        │
        ▼
SaveCoordinator
        │
        ▼
PersistenceService
        │
        ├── FrontmatterSerializer
        ├── VaultFileSystem
        └── Vault Refresh
        │
        ▼
SaveCoordinator.completeSave()
```

This is a cleaner separation than having SaveCoordinator own serialization and filesystem concerns, and it aligns much better with the architecture evolving throughout Arc 5.
