# Architectural research: the document lifecycle in mature editors

## Research caveat

The applications fall into three categories:

1. **Open-source editor applications and components:** VS Code, Zed, CodeMirror 6, and Monaco. Their internal state ownership and update pipelines can be examined directly.
2. **File-oriented but proprietary applications:** Obsidian and Typora. Their observable behavior and public APIs are documented, but some persistence details—especially physical write algorithms—are not public.
3. **Database-oriented applications:** Bear, Craft, and Notion. These do not use an individual Markdown file as the live canonical document. Their architecture is useful for understanding local persistence, transactions, offline operation, and synchronization, but it should not be copied directly into Clutter.

The most important distinction is:

> **A Markdown-file editor auto-saves a document snapshot to a filesystem. A database-backed editor persists operations or records into a database. These are architecturally different forms of “auto-save.”**

---

# Executive conclusions

Across mature editors, several principles recur:

- The file on disk is not edited directly.
- An in-memory buffer becomes authoritative for the active editing session.
- Views do not own document content.
- Saves operate on a versioned snapshot of the buffer.
- A save that finishes after more edits have occurred must not incorrectly mark the document clean.
- Auto-save is normally debounced, event-triggered, or transaction-based—not a complete file rewrite after every keystroke.
- Filesystem state, editor state, and derived indexes are separate layers.
- External file changes are resolved according to whether the buffer is clean or dirty.
- Undo belongs to the editing transaction history, not to the filesystem.
- Large-file performance depends on incremental data structures, viewport rendering, bounded parsing, and background work.
- Crash recovery and auto-save are complementary mechanisms, not substitutes for each other.

For Clutter, the best reference architecture is:

- **VS Code’s document lifecycle discipline**
- **CodeMirror 6 or Monaco’s model/view separation**
- **Obsidian’s file-canonical vault model**
- **Zed’s revision-aware, incremental processing**
- **Notion’s operation queue only as conceptual inspiration for reliable asynchronous work—not as the canonical storage model**

---

# 1. Document lifecycle

## The general lifecycle

A professional file editor usually follows this sequence:

```text
Filesystem path
    ↓
Read bytes and file metadata
    ↓
Decode bytes into text
    ↓
Create or populate document buffer
    ↓
Create derived document state
    ├─ syntax tree
    ├─ headings and links
    ├─ diagnostics
    └─ search/index data
    ↓
Attach one or more editor views
    ↓
User edits buffer through transactions
    ↓
Buffer becomes dirty
    ↓
Auto-save or manual save captures snapshot
    ↓
Validate filesystem version
    ↓
Write serialized bytes
    ↓
Update saved revision and disk metadata
```

There are normally three distinct notions of truth:

| Scope                                | Source of truth                |
| ------------------------------------ | ------------------------------ |
| Current user intent while editing    | Editor buffer                  |
| Durable canonical content            | File on disk or database       |
| Search, backlinks, catalog, previews | Derived caches and projections |

This avoids the misleading idea that one object must be the source of truth for every purpose.

---

## Visual Studio Code

VS Code wraps a Monaco text model inside a higher-level file model. Its `TextFileEditorModel` retains the encoding, current file metadata, content version, saved-buffer version, dirty status, conflict status, orphan status, save errors, and a sequential save queue. The underlying Monaco `ITextModel` owns the editable text and editor-facing operations. ([GitHub][1])

A simplified VS Code lifecycle is:

```text
FileService reads file
    ↓
TextFileEditorModel records stat/encoding/etag
    ↓
Monaco ITextModel contains editable text
    ↓
Editor views render that model
    ↓
Model content event increments document version
    ↓
TextFileEditorModel marks document dirty
    ↓
Save captures a text snapshot
    ↓
FileService writes snapshot with expected file version
    ↓
Saved revision and stat are updated
```

When a model is resolved again, VS Code normally does not replace an existing dirty or currently-saving model with disk content unless the operation explicitly supplies replacement contents. This prevents a background reload from destroying unsaved work. ([GitHub][1])

VS Code also distinguishes the current model version from the version last successfully saved. If undo returns the model to the saved alternative version, it can clear the dirty state without needing another disk write. ([GitHub][1])

**State owner:** `TextFileEditorModel` owns the file lifecycle; Monaco’s `ITextModel` owns the live text.

---

## Monaco Editor

Monaco exposes an `ITextModel`, identified optionally by a URI, independently from any editor widget. Multiple editor views can use a model, and the model contains the text, version identifiers, snapshots, edits, selections-related APIs, decorations, and undo capability. View state such as scrolling and cursor placement is handled separately. ([microsoft.github.io][2])

Monaco itself does not define:

- How a URI is read
- When the model is saved
- Whether saving is debounced
- How external changes are watched
- How writes are made atomic

Those responsibilities belong to the host application. VS Code supplies those layers around Monaco.

**State owner:** `ITextModel` for text; host application for persistence.

---

## CodeMirror 6

CodeMirror 6 makes the separation especially explicit:

- `EditorState` contains the current immutable document, selection, and state extensions.
- A `Transaction` describes a transition from one state to another.
- `EditorView` renders the state and translates browser input into transactions.
- Extensions add history, syntax trees, language services, and other state. ([codemirror.net][3])

The lifecycle is:

```text
Host loads text
    ↓
EditorState.create(document)
    ↓
EditorView renders state
    ↓
Input produces Transaction
    ↓
Transaction produces new EditorState
    ↓
View renders changed ranges
    ↓
Host observes transaction and schedules persistence
```

CodeMirror deliberately does not know what a file is. It is an editor architecture, not a document-storage system.

**State owner:** `EditorState`; persistence belongs to the host.

---

## Zed

Zed loads file contents into an in-memory buffer using rope- and tree-based structures rather than repeatedly manipulating a single contiguous string. Its collaborative buffer model also uses CRDT operations, logical anchors, operation identifiers, tombstones, version vectors, and ordered timestamps. These structures let editor positions remain stable as text is inserted or deleted. ([Zed][4])

An editor pane does not own a separate independent copy of the file. Views operate on a shared buffer, which is why editing one open representation of a file updates another representation of the same file. Zed also supports multibuffers that combine excerpts from multiple underlying buffers. ([Zed][5])

Its conceptual lifecycle is:

```text
Worktree resolves path
    ↓
File content loaded into Buffer
    ↓
Rope/CRDT structures own live text
    ↓
Views refer to logical positions in Buffer
    ↓
Operations mutate buffer state
    ↓
Parsing and UI projections update incrementally
    ↓
Save writes a buffer snapshot
```

**State owner:** shared `Buffer`, with project/worktree layers owning filesystem identity.

---

## Obsidian

Obsidian uses CodeMirror 6 for its Markdown editor. The public editor API exposes transactions, undo, redo, reads, and text replacement. Obsidian explicitly recommends using the active editor API for active documents because that preserves cursor, selection, fold state, and editor behavior; modifying the file through the vault API bypasses the active editor model. ([Developer Documentation][6])

The approximate lifecycle is:

```text
Vault and adapter identify file
    ↓
File content loaded into CodeMirror EditorState
    ↓
Editor state owns live text
    ↓
MetadataCache owns derived headings/links/tags
    ↓
Edits update editor state
    ↓
Obsidian auto-saves text to vault file
    ↓
Vault events invalidate caches
    ↓
MetadataCache reparses changed file
```

The `Vault` abstraction owns disk-level reads, writes, and events. `MetadataCache` is a separate, derived index. Obsidian’s `cachedRead` is intended for display-oriented repeated access; direct disk reads are recommended when an operation will modify content, because the cache may lag filesystem reality until invalidated. ([Developer Documentation][7])

**State owner:** CodeMirror for an active document; Vault for durable file operations; MetadataCache for derived information.

---

## Typora

Typora publicly documents live preview, auto-save, crash recovery, and folder watching, but not the details of its text-buffer implementation. A live Markdown editor with cursor state, undo, and inline rendering necessarily maintains an in-memory document model, but the exact structure is proprietary. ([Typora Support][8])

On macOS, Typora integrates with the operating system’s document auto-save and versioning. On Windows and Linux, it has its own optional interval-based auto-save and separate draft recovery. ([Typora Support][9])

**State owner:** internal document model, not publicly documented.

---

## Bear

Bear is not a folder-of-Markdown-files editor. Bear stores notes in SQLite and warns users not to alter its database while the application is running. Markdown and TextBundle are export and interchange formats rather than a one-file-per-live-note canonical store. ([Bear Markdown Notes][10])

The likely lifecycle is therefore:

```text
SQLite note record
    ↓
Runtime note/editor object
    ↓
User edits note
    ↓
Database mutation or transaction
    ↓
iCloud synchronization
```

Bear notes have unique identifiers, and synchronization may produce separate conflicting notes that the user must reconcile. ([Bear Markdown Notes][11])

**State owner:** runtime note model backed by SQLite.

---

## Craft

Craft is block- and database-oriented. Its architecture documentation describes a separation between UI and data, with a Sync Service owning document data. Earlier versions stored core document and block data in Realm, and Realm Sync propagated mutations between devices. Mobile clients can retain whole spaces for offline use, while web clients can synchronize individual documents. ([Craft Docs][12])

The conceptual lifecycle is:

```text
Local document/block records
    ↓
Editor projection
    ↓
Block-level mutations
    ↓
Local persistent store
    ↓
Sync service
    ↓
Remote and other-device updates
```

**State owner:** document data service and local database, not an individual Markdown file.

---

## Notion

Notion models changes as operations on records. UI actions create one or more operations, which are grouped into transactions. A client applies a transaction to local state immediately, updates a record cache, re-renders, and persists the transaction in a queue until the server accepts or rejects it. The queue normally sends transactions immediately. The server applies them to copied record state, validates them, and atomically commits the changed records. ([Notion][13])

Its newer offline architecture promotes SQLite from a cache to persistent local storage and uses CRDTs for offline-capable pages. It also uses one-writer arrangements to avoid local database corruption in environments where multiple tabs or processes could otherwise write concurrently. ([Notion][14])

**State owner:** local record cache and transaction queue, reconciled with server record versions.

This is highly effective for a collaborative database application but is fundamentally different from Clutter’s “Markdown is canonical” principle.

---

# 2. The editor buffer

## Why professional editors use one

Directly treating the disk file as the editable object would create several problems:

- A filesystem write would be needed before the application could display every change.
- Undo would require reconstructing old files.
- Selections and cursor positions would have no stable relationship to edits.
- Syntax parsing would repeatedly reread disk.
- Unsaved states could not exist.
- External-change conflicts could not distinguish local intent from disk state.
- A crash during a direct overwrite could damage both the current and previous contents.

The editor buffer creates a low-latency, transactional workspace.

---

## What a buffer usually contains

Depending on the editor, it may contain or reference:

- Current text
- A rope, piece tree, gap buffer, or persistent text tree
- Current revision or version ID
- Saved revision
- Selection and cursor state, or links to view-owned selection state
- Undo and redo history
- Decorations and markers
- Syntax tree or parser state
- Line index
- Text anchors
- Dirty state
- Encoding and line-ending information
- Base disk version used for conflict detection
- Diagnostics or links to diagnostics
- Save-in-progress state

Not all of these need to be in one object. Mature systems usually separate text, view state, file lifecycle, and derived analysis.

---

## How it differs from the file

The file is:

- Byte-oriented
- Durable
- Shared with other programs
- Subject to encoding and filesystem metadata
- Updated only at save boundaries

The buffer is:

- Text- or operation-oriented
- Mutable or transactionally replaceable
- Optimized for random edits
- Capable of representing unsaved changes
- Rich in editor-specific state
- Usually versioned more finely than the file

A file might be UTF-8 bytes with CRLF line endings. The buffer might expose normalized lines and logical positions while retaining enough metadata to reproduce the intended encoding and line endings.

---

## When the buffer becomes the source of truth

The buffer becomes authoritative for the user’s current editing intent as soon as loading completes.

The disk file remains the durable canonical representation.

That yields the following rule:

```text
Clean open document:
    Buffer content == disk content

Dirty open document:
    Buffer = current user intent
    Disk = last durable version

After successful save:
    Disk catches up to saved buffer revision

After closing a clean document:
    Disk is again the only content authority
```

A derived `Page` object, AST, or catalog entry should never outrank either of those.

---

# 3. Auto-save

## Application behavior

| Application  | Publicly documented behavior                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VS Code      | Manual save by default. Auto Save options include after a delay, focus change, and window change. The documented default delay is 1,000 ms. Unsaved content is also backed up through hot-exit facilities. ([Visual Studio Code][15])                                                      |
| Zed          | Auto-save is off by default. Modes include focus change, window change, and a configurable delay. Closing an unsaved tab triggers saving even if the configured delay has not elapsed. ([Zed][16])                                                                                         |
| Obsidian     | Auto-save is automatic. Public APIs do not promise an exact interval; community-observed behavior and historical release information place the normal write/merge window at roughly two seconds. Treat that number as observed behavior, not a stable API contract. ([Obsidian Forum][17]) |
| Typora       | On macOS, OS-level document auto-save is always active. On Windows and Linux, interval auto-save is optional and defaults to five minutes when enabled. Separate draft recovery protects unsaved work. ([Typora Support][9])                                                               |
| Bear         | Editing is persisted into its local database and synchronized automatically through iCloud. The exact per-keystroke batching or transaction cadence is not public. ([Bear Markdown Notes][18])                                                                                             |
| Craft        | Mutations are persisted locally and passed through a synchronization service. Exact batching is private. Earlier public architecture material describes Realm persistence and automatic synchronization. ([Craft Docs][12])                                                                |
| Notion       | User actions create local transactions. They are immediately applied to local state, persisted in a local queue, and ordinarily sent to the server immediately. This is operation persistence, not repeated full-document serialization. ([Notion][13])                                    |
| CodeMirror 6 | No built-in file auto-save policy. The host observes transactions and decides when to persist.                                                                                                                                                                                             |
| Monaco       | No built-in file auto-save policy. The host owns saving and filesystem integration.                                                                                                                                                                                                        |

---

## Save on every keystroke

A literal full-file write after every key is rarely appropriate.

### Advantages

- Small theoretical loss window
- Simple mental model
- Disk content almost always current

### Disadvantages

- Excessive filesystem activity
- Repeated whole-file serialization
- File watcher storms
- Cloud-sync churn
- More opportunities for write conflicts
- SSD and network-folder overhead
- Harder undo/redo semantics if external tools react to every write
- Temporary syntactically invalid Markdown constantly exposed to other programs

Database-backed applications may persist a small transaction after each logical action. That is not equivalent to rewriting a 10 MB Markdown file after every key.

---

## Debounced save

A trailing debounce waits until editing has been idle for a period, commonly around one second.

```text
Edit
  → restart timer
Edit
  → restart timer
No edit for 1 second
  → save
```

### Advantages

- Coalesces typing bursts
- Keeps disk reasonably current
- Limits watcher and sync activity
- Straightforward to explain
- Good default for local Markdown

### Disadvantages

- Continuous typing can postpone saving indefinitely unless a maximum delay exists
- The most recent edits can still be lost in a process or machine crash
- Requires careful revision handling when edits occur during a write

A maximum-latency cap solves the continuous-typing problem.

---

## Save on focus loss

### Advantages

- Natural checkpoint when moving to another document or application
- Reduces background writes while actively typing
- Good supplemental policy

### Disadvantages

- A user can work for a long time without changing focus
- Keyboard-driven workflows may not produce expected focus changes
- A crash can occur before focus is lost

It should supplement a timer, not replace it.

---

## Fixed interval save

Typora’s Windows/Linux option is an example.

### Advantages

- Predictable write rate
- Low implementation complexity
- Good for long documents where frequent writes are expensive

### Disadvantages

- Loss window can be several minutes
- Writes may occur while the user is actively typing
- Saves can contain transient partial constructs
- The interval is unrelated to editing activity

---

## Manual save

Manual save remains useful even in an auto-saving application:

- It acts as an explicit checkpoint.
- Users can force external tools to see the latest content.
- It gives immediate feedback about write errors.
- It is familiar and accessible.

For an auto-save-first product, `Ctrl/Cmd+S` should mean “flush this document now,” not “the only way to persist.”

---

# 4. The save pipeline

## The mature general pipeline

```text
1. Capture buffer revision R
2. Capture immutable text snapshot for R
3. Run controlled save participants
4. Serialize using encoding and line-ending policy
5. Check whether content actually changed
6. Verify the disk file still matches the expected base
7. Write bytes
8. Re-read or re-stat the result
9. Mark revision R as saved
10. Leave document dirty if revision > R
11. Update catalog and indexes
12. Classify resulting watcher event as self-generated
```

The key rule is step 10.

Suppose:

```text
Buffer revision 40 → save begins
User types → buffer becomes revision 41
Write of revision 40 succeeds
```

The application must record that revision 40 is durable, while revision 41 remains dirty. Marking the whole document clean would lose the distinction.

---

## VS Code

VS Code serializes saves through a save sequentializer. It captures a text snapshot and invokes the text-file service with encoding, expected modification information, and an etag unless conflict prevention has been disabled. When the write completes, it updates the file stat. It clears dirty state only if the model has not changed since the saved snapshot was taken. ([GitHub][1])

A save conflict is raised when the file no longer matches the expected disk version. Any save error leaves the model dirty so the in-memory contents remain protected. ([GitHub][1])

Conceptually:

```text
Monaco model
    ↓ snapshot
Save participants
    ↓
Encode
    ↓
Expected-etag write
    ↓
Update stat
    ↓
Clear dirty only if model revision still matches
```

---

## Obsidian

Obsidian has two relevant routes:

1. Active editor changes, which flow through CodeMirror and preserve editor state.
2. Vault-level operations such as `read`, `modify`, and `process`.

Its `Vault.process` operation guarantees that the file does not change between the read and write at the application-operation level. Obsidian recommends it for safe read-modify-write workflows, and warns asynchronous plug-in code to verify that another process has not changed the data before committing. ([Developer Documentation][19])

After modification, vault events invalidate read caches and drive metadata-cache updates. ([Developer Documentation][7])

The physical file-write sequence is not publicly specified.

---

## Zed

Zed saves the current buffer state through its project/worktree filesystem layer. The buffer and project layers retain enough version and file metadata to decide when an external file needs reloading. Save-related operations are coordinated so multiple views of the same underlying buffer do not produce independent conflicting saves. Public source and issue history show that disk metadata, buffer dirty state, and `ReloadNeeded` state interact in this process. ([GitHub][20])

Format-on-save or similar save participants may themselves create editor operations and can therefore affect undo/redo. Zed’s issue history illustrates why save participants must be treated separately from the low-level file write. ([GitHub][21])

---

## Typora

Typora exposes the user-facing save policy but not its full internal pipeline. On macOS, much of document saving and versioning is integrated with the native document system. On other platforms, Typora periodically saves and separately maintains recovery drafts. ([Typora Support][9])

No reliable public documentation establishes whether Typora uses direct overwrite, safe-save replacement, or a platform-specific combination.

---

## Bear and Craft

For Bear and Craft, the save pipeline is closer to:

```text
Editor mutation
    ↓
Runtime note/block update
    ↓
Local database transaction
    ↓
Synchronization queue
    ↓
Cloud or remote service
```

There is no normal “serialize entire Markdown file and replace it” boundary. Bear stores notes in SQLite, while Craft’s published architecture describes local persistent records and a service responsible for document synchronization. ([Bear Markdown Notes][10])

---

## Notion

Notion’s public architecture is the clearest example of transaction-oriented saving:

```text
UI action
    ↓
Operations
    ↓
Transaction
    ↓
Apply optimistically to local records
    ↓
Persist in TransactionQueue
    ↓
Send to server
    ↓
Validate and atomically commit changed records
    ↓
Notify other clients
```

The local interface does not wait for the network before showing the result. The durable local queue bridges temporary offline or network failure. ([Notion][13])

This is useful inspiration for reliable queues and revision-aware async work, but it is unnecessary complexity for a single-user Markdown-file save path.

---

# 5. Atomic writes

## What “atomic write” should mean

A crash-resistant file replacement normally looks like:

```text
Original: note.md

1. Write complete new bytes to temporary sibling file
2. Flush temporary file
3. Preserve required permissions and metadata
4. Recheck original version if necessary
5. Atomically replace note.md with temporary file
6. Flush parent directory where supported
```

Using a temporary file in the same directory is important because rename atomicity is generally a same-filesystem property.

This protects against a common failure:

```text
Open original
→ truncate original
→ process crashes halfway through writing
→ original is now partial or empty
```

It does not eliminate every risk. Cloud-backed folders, antivirus tools, Windows handle semantics, unusual filesystems, and power loss can complicate guarantees.

---

## What is publicly known

### VS Code

VS Code’s source treats the file-service write as a non-cancellable unit from the model’s point of view, but its own error-handling comments explicitly recognize that a failed write may have corrupted the disk content after truncation. Therefore, it is not correct to claim that every VS Code filesystem provider performs crash-safe temporary-file replacement. The buffer remains dirty on failure, preserving the in-memory copy. ([GitHub][1])

VS Code’s backup and hot-exit mechanisms provide a second layer of protection for unsaved content. ([Visual Studio Code][15])

### Obsidian

`Vault.process` is atomic in the logical sense that it coordinates read-modify-write against intervening changes. Public documentation does not establish that every desktop adapter uses temporary-file-plus-rename physical replacement. ([Developer Documentation][19])

Obsidian’s File Recovery feature stores complete snapshots periodically, by default with a minimum interval of five minutes and a default retention of seven days. These snapshots are outside the vault and provide recovery independently from normal saves. ([Obsidian][22])

### Zed

Zed’s public sources establish revision-aware buffers and project filesystem coordination, but the available public behavior does not justify a universal claim that all Zed saves use atomic replace on every platform and filesystem.

### Typora

The exact physical write mechanism is not public. macOS document infrastructure supplies platform-level auto-save and versioning; Windows/Linux use Typora’s own save and draft systems. ([Typora Support][9])

### Bear, Craft, and Notion

These applications rely primarily on transactional database storage rather than replacing one Markdown file. Database journal or WAL guarantees are the relevant layer, although their exact production configurations are private.

### CodeMirror 6 and Monaco

Neither performs file writes.

---

# 6. External file changes

Consider a note open in Clutter that is changed by VS Code.

The correct response depends primarily on two variables:

1. Did the disk content actually change?
2. Does Clutter have unsaved local changes?

---

## The fundamental decision matrix

| Buffer state | External event                   | Recommended response                       |
| ------------ | -------------------------------- | ------------------------------------------ |
| Clean        | File contents changed            | Reload automatically                       |
| Clean        | Metadata only changed            | Update metadata; do not replace text       |
| Dirty        | Non-overlapping external change  | Attempt three-way merge                    |
| Dirty        | Overlapping external change      | Pause auto-save and show conflict UI       |
| Clean        | File deleted                     | Mark missing and offer close or recreate   |
| Dirty        | File deleted                     | Preserve buffer; offer recreate or Save As |
| Any          | File moved or renamed            | Rebind path using stable identity          |
| Any          | Event matches own completed save | Acknowledge and suppress redundant reload  |

---

## VS Code

VS Code watches open files and can queue models for reload when their underlying files change. If an external program changes a clean file, VS Code generally reloads it. When the editor is dirty and the disk version is newer, VS Code prevents blind overwrite and offers conflict comparison. ([GitHub][23])

Its conflict prevention has historically used file metadata and etag-like values derived from information such as modification time and size. ([GitHub][24])

The broader design is more important than the precise etag implementation:

```text
Loaded disk version A
Local buffer becomes B
Disk independently becomes C

Saving B over C is rejected
User compares or resolves B and C
```

---

## Obsidian

Obsidian’s vault events invalidate file caches and drive re-indexing. When an external modification arrives while the editor has recent unsaved changes, publicly observed Obsidian behavior reports that it merges the external and in-memory changes automatically. The exact merge algorithm is proprietary, and edge-case watcher/reload bugs have been reported, so this should not be treated as a formal conflict-resolution specification. ([Obsidian Forum][25])

For plug-in authors, Obsidian recommends direct disk reads before modification and safe `Vault.process` operations to avoid overwriting concurrent changes. ([Developer Documentation][7])

---

## Zed

Zed’s worktree watcher reports changed paths, and its project layer compares file metadata before deciding whether a buffer requires a reload. Public source discussions show that clean buffers are intended to reload while dirty buffers are protected from automatic replacement. Recent fixes have addressed edge cases involving same-size or same-timestamp changes and stale reload state. ([GitHub][20])

Zed also retains open buffers for files that are deleted rather than immediately destroying the editor state. ([Zed][26])

---

## Typora

Typora watches folders opened in its file tree and updates the tree for moved or deleted files, with manual refresh available as a fallback. Its detailed dirty-buffer conflict algorithm is not publicly documented. ([Typora Support][27])

---

## Bear, Craft, and Notion

There is no external Markdown-file watcher for the canonical note content.

Their equivalent problem is concurrent record mutation:

- Bear may create separate conflicted notes for manual reconciliation. ([Bear Markdown Notes][28])
- Craft’s sync service reconciles local and remote document records. ([Craft Docs][12])
- Notion uses record versions, transactions, websocket notifications, and—on offline-capable pages—CRDT reconciliation. ([Notion][13])

---

## Three-way merge

A mature file editor should retain:

- **Base:** the text originally loaded or last saved
- **Local:** the current buffer
- **Remote:** the newly read disk text

Then compute:

```text
merge(Base, Local, Remote)
```

Non-overlapping edits can be accepted automatically.

Overlapping edits should not be guessed at silently. The editor should show:

- Local version
- Disk version
- Common base or inline conflict regions
- Keep Local
- Accept Disk
- Apply Merged Result

For Clutter, this is preferable to a CRDT because the conflict is between snapshots written by independent filesystem applications, not between peers sharing a common operation protocol.

---

# 7. File watching

## Do editors rescan the entire workspace?

Normally, no.

A mature application uses operating-system filesystem notifications to receive affected paths. It then:

1. Normalizes and coalesces events.
2. Determines whether the event was generated by the application itself.
3. Stats or reads only affected paths.
4. Updates only affected document and catalog records.
5. Reparses only content whose fingerprint changed.
6. Reconciles the entire workspace only when events were lost, the watcher overflowed, or the application resumes from a long sleep.

---

## VS Code

VS Code has both broad filesystem-change events and correlated watcher requests. Correlated watchers carry identifiers and route events to the matching request, reducing unnecessary work. Identical watcher requests may be deduplicated. Recursive workspace watching honors configured exclusions. ([GitHub][29])

This lets VS Code identify a changed file from the event path rather than reparsing every file in a workspace.

---

## Obsidian

Obsidian exposes create, modify, delete, and rename-style vault events. A file notification invalidates cached reads, and the MetadataCache indexes the changed file before emitting its metadata-change event. Link-resolution structures such as `resolvedLinks` are then updated from changed metadata. ([Developer Documentation][30])

This is an important design precedent for Clutter:

> A filesystem notification is not itself an index update. It is the trigger for a controlled read, parse, and index transition.

---

## Zed

Zed’s worktree layer processes path-change events. A full or broader rescan is a fallback when watcher queues overflow or events cannot be trusted, rather than the normal response to every edit. ([GitHub][31])

---

## Typora

Typora watches the currently opened folder and updates its file list/tree when paths are moved or deleted. ([Typora Support][27])

---

## Database-backed applications

Bear, Craft, and Notion watch database or synchronization changes rather than arbitrary Markdown paths:

- A changed record version identifies the affected note, block, or page.
- Only subscribed or cached records need immediate refresh.
- Notion’s clients receive version updates and fetch stale records rather than downloading the entire workspace again. ([Notion][13])

---

# 8. Runtime models

Different names are used, but these responsibilities recur.

## Document

Represents one logical editable resource.

Typical responsibilities:

- Identity
- Current text or link to text model
- Disk path
- Encoding
- Saved and current revisions
- Dirty/saving/conflict state
- Base version for merge
- Lifetime management

VS Code’s `TextFileEditorModel` and Zed’s `Buffer` are examples of this role.

---

## Editor buffer or text model

Optimized representation of current text.

Responsibilities:

- Insert and delete
- Efficient line and offset mapping
- Snapshots
- Change events
- Undoable operations
- Versioning

Examples:

- Monaco `ITextModel`
- CodeMirror `EditorState.doc`
- Zed rope/CRDT buffer

---

## Editor view or view model

Represents one presentation of a document.

Responsibilities:

- Cursor and selection
- Scroll position
- Fold state
- Visible range
- Input handling
- Layout
- Decorations local to the view

Multiple views may share one document buffer while retaining independent selections.

---

## Workspace or vault

Represents a collection of resources.

Responsibilities:

- Root path
- Filesystem adapter
- Open-document registry
- Watcher ownership
- Settings
- Exclusions
- File operations such as move and rename
- Workspace-level commands

Obsidian calls this concept a vault. VS Code and Zed use workspace/project/worktree concepts.

---

## Catalog

A lightweight registry of known pages and files.

Responsibilities:

- Page ID to path mapping
- Path to page ID mapping
- Titles
- File timestamps and fingerprints
- Basic frontmatter metadata
- Existence state
- Parse/index status

A catalog should not duplicate the full canonical Markdown unless it is explicitly a cache.

---

## Index

Derived data optimized for queries.

Examples:

- Full-text search
- Backlinks
- Forward links
- Tags
- Headings
- Unresolved links
- Embeddings or semantic search
- Recently modified ordering

Obsidian’s `MetadataCache` and `resolvedLinks` structures illustrate this role. ([Developer Documentation][32])

---

## Transaction or operation

Represents a state transition.

Responsibilities:

- Describe changed ranges
- Group related edits
- Drive undo
- Notify incremental consumers
- Carry metadata such as user action, remote change, or formatting

CodeMirror treats transactions as the central update mechanism; Notion uses transactions at the record level; Zed’s CRDT model uses operations. ([codemirror.net][3])

---

## Save coordinator

Often implicit, but architecturally important.

Responsibilities:

- Debounce saves
- Serialize concurrent save attempts
- Capture revisioned snapshots
- Coalesce pending saves
- Handle conflicts
- Classify errors
- Update saved revision
- Correlate watcher notifications

VS Code’s save sequentializer is a concrete example. ([GitHub][1])

---

## Recovery store

Separate from the primary file.

Responsibilities:

- Recover unsaved content after process failure
- Retain previous snapshots
- Compare recovered text against current disk text
- Avoid polluting the user’s vault with implementation artifacts

VS Code hot exit, Obsidian File Recovery, and Typora drafts demonstrate this separate recovery layer. ([Visual Studio Code][15])

---

# 9. Incremental updates

When one character changes, a good system does not “refresh the application.”

## Components that should update immediately

1. Text structure for the changed range
2. Current document revision
3. Dirty status
4. Undo transaction
5. Cursor and selection positions
6. Visible-line layout, where affected
7. Syntax tree near the change
8. Decorations intersecting affected ranges
9. Current Page projection fields affected by the change
10. Auto-save timer
11. Any volatile search or backlink overlay for the open document

CodeMirror changes precisely describe replaced ranges, letting extensions update only relevant state. Lezer reuses unchanged syntax-tree fragments. ([codemirror.net][3])

Zed similarly uses logical anchors and tree-based summaries so edits do not require recomputing every position in the buffer. ([Zed][33])

---

## Components that should not update immediately

A single character should not normally cause:

- A full vault scan
- Re-reading the file from disk
- A complete workspace re-index
- Re-parsing unrelated documents
- Rebuilding every backlink
- Re-rendering offscreen documents
- Rewriting the catalog database
- Reopening the editor model
- Recreating undo history
- Re-tokenizing the entire large file synchronously
- A complete disk write after each key

---

## Revision tagging

Every asynchronous task should carry the document revision it analyzed.

Example:

```text
Revision 18: start parsing
Revision 19: user edits again
Parser finishes result for revision 18
```

The result must either:

- Be discarded as stale, or
- Be incrementally advanced to revision 19

It must not replace revision-19 state with revision-18 output.

This applies to:

- Parsing
- Search indexing
- Link extraction
- Preview rendering
- Saving
- Linting
- Outline generation

---

# 10. Undo and redo

## Common implementations

### Text operations

Store insertions and deletions:

```text
Insert "abc" at position 20
Delete characters 7–12
```

This is memory-efficient and works well with grouping.

### Transactions

Store one or more text operations plus metadata as a logical action.

Examples:

- Typing a word
- Pasting a paragraph
- Renaming a heading
- Applying a format command
- Accepting an external merge

This is the most useful abstraction for modern editors.

### Snapshots

Store complete or persistent-state snapshots.

Naive full copies are expensive, but persistent immutable structures can share unchanged portions, making snapshots practical. CodeMirror’s immutable `EditorState` uses this style internally while history remains transaction-oriented. ([codemirror.net][3])

---

## Application examples

- **CodeMirror 6:** undo is a state extension driven by transactions.
- **Monaco:** undo belongs to the text model. Replacing or disposing the model can lose its history; setting the whole value is not equivalent to applying ordinary undoable edits. ([GitHub][34])
- **VS Code:** compares the Monaco alternative version with the saved version, allowing undo back to the saved content to clear the dirty marker. ([GitHub][1])
- **Zed:** its operation/CRDT identifiers also support undo and redo of insertions and deletions. ([Zed][33])
- **Notion:** operations are grouped into transactions, although server persistence and user-facing undo are separate concerns. ([Notion][13])

---

## Interaction with auto-save

Auto-save should not:

- Clear undo history
- Add an undo entry
- Change the meaning of undo
- Introduce a visible text mutation
- Make the save boundary a history boundary

Undo changes the buffer. Auto-save merely makes a snapshot of a buffer revision durable.

Correct behavior:

```text
Type A → revision 1 → auto-save
Type B → revision 2 → auto-save
Undo B → revision 3, text equals saved revision 1 content
```

The application may need another save to make disk match the undone content unless the most recent disk content already equals it.

A content or alternative-version comparison can determine whether the document is effectively clean.

Format-on-save is a special case. Because it changes text, it must either:

- Become one clear, undoable transaction, or
- Be avoided by default

Clutter should avoid ambient whole-document formatting on save because human-readable Markdown and stable diffs are core goals.

---

# 11. Large-file and large-workspace performance

## Large Markdown files

### Efficient text structures

A contiguous string is expensive when repeatedly inserting into its middle.

Editors use structures such as:

- Piece trees
- Ropes
- Balanced text trees
- Persistent line trees

VS Code uses a piece-tree text buffer. Zed uses rope and SumTree structures. CodeMirror’s document representation is a persistent tree designed for efficient updates. ([GitHub][35])

---

### Viewport rendering

Only visible lines and a modest margin should be fully laid out and decorated.

VS Code performs primary tokenization around the viewport and can continue background tokenization elsewhere. CodeMirror stops or bounds expensive work far from the active viewport and resumes around newly visible regions. ([GitHub][36])

---

### Incremental parsing

Lezer and Tree-sitter reuse unchanged syntax subtrees. A one-character edit normally reparses a limited region, although language semantics can occasionally force a wider reparse. ([lezer.codemirror.net][37])

---

### Feature degradation

For very large files, mature editors may reduce or disable:

- Semantic highlighting
- Full-document diagnostics
- Minimap
- Code folding
- Live preview transformations
- Link extraction for the whole file
- Expensive plug-ins
- Continuous full-text analysis

VS Code exposes large-file optimization behavior specifically to avoid memory-intensive features. ([GitHub][38])

Typora has publicly documented support cases in which extremely large files can make startup or opening unresponsive, showing that a rich live-preview pipeline without sufficiently aggressive limits can become a bottleneck. ([Typora Support][39])

---

## Large workspaces

A scalable workspace should:

- Load a persistent catalog quickly
- Reconcile it against disk in the background
- Watch path-level changes
- Fingerprint files to avoid redundant parsing
- Prioritize open and recently changed documents
- Index in bounded background batches
- Keep indexes rebuildable
- Exclude generated and irrelevant folders
- Fall back to a full reconciliation only after watcher loss or overflow

Notion applies an analogous principle to record synchronization: it subscribes to relevant page updates and fetches stale versions rather than reloading all workspace data. ([Notion][40])

---

# 12. Common architectural patterns

## 1. Buffer separated from persistence

Why it is adopted:

- Low-latency editing
- Unsaved state
- Undo
- Parsing
- Conflict handling
- Multiple views
- Recovery

---

## 2. One document model shared by multiple views

Why:

- Prevents duplicate sources of truth
- Keeps split views synchronized
- Avoids independent save races
- Allows each view to retain its own selection and scroll state

---

## 3. Transaction or command pattern

Why:

- Groups semantic actions
- Drives undo
- Enables plug-ins
- Supports logging and replay
- Provides changed ranges to incremental systems
- Separates intent from side effects

CodeMirror’s state transitions and Notion’s record transactions are different implementations of this same broad idea. ([codemirror.net][3])

---

## 4. Immutable or versioned state

Not every editor is fully immutable, but mature editors attach revisions to state.

Why:

- Detect stale async results
- Coordinate saving
- Compare against saved state
- Support snapshots
- Enable optimistic processing

---

## 5. Incremental parsing

Why:

- Parsing an entire document per key does not scale
- Most text remains unchanged
- Editors need fast outlines, highlighting, links, and previews

---

## 6. Background indexing

Why:

- Search and backlinks are important but not part of the keystroke-critical path
- Large workspaces need prioritization
- Indexes can lag slightly without damaging canonical data

---

## 7. Event-driven filesystem synchronization

Why:

- A path-level event is cheaper than a workspace scan
- External applications can modify canonical files
- The application must react without monopolizing I/O

---

## 8. Optimistic concurrency checks

Why:

- Prevent silent overwrite
- Detect changes made by other applications
- Turn ambiguous races into explicit conflicts

VS Code’s expected file metadata/etag behavior and Obsidian’s `Vault.process` serve this goal. ([GitHub][1])

---

## 9. Recovery separated from save

Why:

- Auto-save may fail
- The process may crash before the timer fires
- The disk file itself may be damaged
- Users may need an earlier version, not merely the latest one

---

## 10. Derived indexes are disposable

Why:

- The canonical document should survive index corruption
- Schema changes can rebuild the cache
- External changes can be reconciled from source files
- Backups remain understandable without the application

This is particularly important for Clutter.

---

# 13. Recommended architecture for Clutter

## Architectural position

Clutter should be a **file-canonical editor with a versioned in-memory document model and rebuildable derived storage**.

It should not be:

- A database-first note system that happens to export Markdown
- A full-document AST editor that regenerates Markdown on every save
- A CRDT-based application unless real-time collaboration becomes a requirement
- A workspace that reparses everything after each filesystem event
- An auto-save system that writes the entire file after every keystroke

The most appropriate synthesis is:

> **Markdown durability like Obsidian, document discipline like VS Code, editor transactions like CodeMirror, and incremental work scheduling like Zed.**

---

## A. Core invariants

Clutter should establish these invariants early:

1. **Markdown bytes on disk are the durable canonical representation.**
2. **An open PageDocument owns the user’s current text.**
3. **There is at most one live PageDocument per canonical Page ID.**
4. **Multiple editor panes share that PageDocument.**
5. **A runtime Page is a projection of text, not a second canonical copy.**
6. **The Vault Catalog is rebuildable from Markdown.**
7. **Search and link indexes are rebuildable caches.**
8. **Every buffer mutation increments a revision.**
9. **Every async result is associated with a revision or disk fingerprint.**
10. **A save never silently overwrites an externally modified file when local changes exist.**
11. **Auto-save does not affect undo history.**
12. **A failed save leaves the document dirty and recoverable.**

These invariants prevent most lifecycle bugs before implementation details accumulate.

---

## B. Recommended runtime models

### 1. Vault

Owns:

- Root directory
- Filesystem adapter
- Watcher
- Settings
- Exclusion rules
- Document registry
- Catalog
- Index services
- Vault-wide operations

It should coordinate operations, not hold every document’s full text.

---

### 2. PageDocument

One live instance per open page.

Recommended fields and responsibilities:

- Stable Page ID
- Current path
- Editor buffer
- Current revision
- Saved revision
- Base disk snapshot or merge base
- Disk fingerprint
- Encoding
- Line-ending style
- Dirty state
- Saving state
- Conflict state
- Missing/orphan state
- Save error
- Pending auto-save request
- Runtime Page projection

This can initially be the central object rather than splitting the same responsibility among several thin abstractions.

---

### 3. EditorBuffer

Owned by the chosen editor framework.

Contains or exposes:

- Current text
- Transaction dispatch
- Undo/redo
- Change sets
- Snapshots
- Selection mapping
- Revision or version ID

Do not mirror its entire text in a second mutable string.

The buffer is the text source for an open page.

---

### 4. PageViewState

One per pane or tab.

Contains:

- Cursor
- Selection
- Scroll offset
- Fold state
- Preview/editor mode
- Pane-specific decorations

It does not contain its own copy of the Markdown.

---

### 5. Runtime Page

A tolerant, versioned projection derived from the buffer:

- ID
- Title
- Frontmatter
- Headings
- Tags
- Outgoing links
- Block references
- Display summary
- Parse diagnostics

It must be able to represent partially invalid Markdown while the user is typing.

A useful rule is:

```text
PageDocument owns text.
Runtime Page explains text.
```

The runtime Page should carry the buffer revision from which it was derived.

---

### 6. Vault Catalog

A lightweight record per known page:

- Page ID
- Canonical path
- Display title
- Aliases
- File size
- Modification time
- Content fingerprint
- Parse revision
- Index revision
- Existence state
- Last known frontmatter summary

The catalog may use SQLite for speed, but its rows must be disposable and rebuildable.

It should not become a hidden canonical note database.

---

### 7. Index services

Keep indexes conceptually separate:

- Full-text index
- Link graph
- Tag index
- Heading index
- Optional semantic index

They may share one physical database, but their updates should be independently versioned.

---

### 8. SaveCoordinator

Per document, or one coordinator managing per-document queues.

Responsibilities:

- Debounce
- Maximum save latency
- Focus-loss flush
- Serialize saves per document
- Capture snapshots
- Validate disk base
- Perform write
- Record saved revision
- Handle conflicts and errors
- Correlate watcher events

---

### 9. RecoveryStore

Stored in Clutter’s application-data directory, outside the vault.

Contains:

- Page ID
- Path at time of snapshot
- Base disk hash
- Buffer revision
- Recovered text or compact delta
- Timestamp

It should be possible to remove this store without damaging the vault.

---

## C. Recommended document state machine

```text
Closed
  ↓ open
Loading
  ↓ success
Clean
  ↓ edit
Dirty
  ↓ auto/manual save
Saving
  ├─ success, no newer edits → Clean
  ├─ success, newer edits → Dirty
  ├─ external mismatch → Conflict
  └─ I/O failure → SaveError/Dirty

Clean or Dirty
  ↓ external delete
Orphaned

Conflict
  ↓ merge/accept/overwrite decision
Dirty or Clean
```

Avoid representing state with a collection of unrelated booleans that can form impossible combinations. The implementation may still use flags internally, but the allowed state transitions should be defined centrally.

---

## D. Open lifecycle

### Step 1: Resolve identity

Given a path:

1. Normalize and canonicalize it.
2. Look it up in the catalog.
3. Prevent opening a second independent PageDocument for the same Page ID.
4. Reuse an existing open PageDocument if present.

### Step 2: Read once

Read:

- File bytes
- Modification time
- Size
- Platform file identity where available
- Permissions
- Encoding markers
- Line-ending style

Use a content hash when needed, but not necessarily as a blocking operation for every small file open.

### Step 3: Decode without rewriting

Preserve:

- UTF-8 BOM if present
- Existing CRLF or LF policy
- Final newline state
- Frontmatter formatting
- User spacing and comments

Do not parse into an AST and regenerate the entire file.

### Step 4: Establish the base snapshot

Retain:

- Loaded text or a cheap immutable buffer snapshot
- Disk fingerprint
- Loaded revision

This becomes the merge base for later external changes.

### Step 5: Create buffer and Page projection

Create the editor buffer from text, then parse the initial Runtime Page.

### Step 6: Attach views

Views subscribe to the PageDocument and receive independent view state.

### Step 7: Reconcile catalog

Update the catalog record only if the file fingerprint or parsed metadata differs.

---

## E. Stable Page IDs

Because Markdown is canonical, stable IDs should ultimately live in the Markdown itself, normally in frontmatter.

### New Clutter pages

Generate the ID before or as part of creating the file. The first durable file should already contain it.

### Existing Markdown without IDs

Do not silently rewrite an entire imported vault merely because it was opened.

Use a staged approach:

1. Assign a provisional catalog identity.
2. Offer an explicit vault migration that inserts IDs.
3. Insert the permanent ID during migration or the first intentional Clutter save.
4. Preserve existing frontmatter formatting as closely as practical.

An explicit migration is better than hidden mass mutation because it respects the user’s ownership of human-readable Markdown.

### Rename handling

A path change should not change Page ID.

The watcher can use:

- Embedded Page ID
- OS file identity when available
- Delete/create pairing
- Content hash
- Recent operation records

to determine that a page moved rather than disappeared and reappeared.

---

## F. Editing lifecycle

For every editor transaction:

```text
Transaction
    ↓
Update editor buffer
    ↓
Increment PageDocument revision
    ↓
Compare current text/version with saved revision
    ↓
Set dirty status
    ↓
Incrementally update Runtime Page
    ↓
Update volatile catalog/index overlay
    ↓
Schedule auto-save
    ↓
Schedule cancellable background analysis
```

### Immediately update

- Buffer
- Revision
- Dirty indicator
- Undo history
- Visible rendering
- Incremental Markdown parse
- Current outline if affected
- Auto-save deadline

### Defer

- Durable catalog transaction
- Durable full-text index
- Backlink database commit
- Full file serialization
- Unrelated page reparsing

---

## G. Recommended auto-save policy

Use a composite policy:

### Primary trigger: trailing debounce

**Recommended default: approximately 1,000 ms after the last edit.**

This closely matches normal file-editor expectations without writing after every key.

### Maximum latency

**Recommended: force a snapshot save after approximately five seconds of continuous editing.**

Otherwise, someone typing continuously may never reach the trailing debounce.

### Focus and window loss

Flush the pending save when:

- Switching pages
- Losing application focus
- Closing a tab
- Closing the window
- Shutting down normally

### Manual save

`Ctrl/Cmd+S` should:

- Cancel the pending timer
- Start or queue a save immediately
- Surface any conflict or error
- Provide a visible completion/error indication

### Recovery cadence

Write recovery data independently:

- After a short idle period
- At a bounded interval during continuous edits
- Before orderly shutdown
- Before replacing a buffer due to an external reload

The recovery write can lag the buffer slightly, but should not depend on the primary file save succeeding.

---

## H. Recommended save pipeline

```text
1. Request save
2. Serialize behind any active save for this PageDocument
3. Capture buffer snapshot and revision R
4. Capture expected base disk fingerprint
5. Apply only explicit, minimal save preparation
6. Encode text while preserving user file conventions
7. Compare against last durable content
8. Revalidate current disk version
9. Handle external mismatch
10. Write to temporary sibling file
11. Flush and atomically replace target
12. Re-stat and optionally verify resulting hash
13. Set saved revision to R
14. Update base snapshot and disk fingerprint
15. Commit catalog/index state for R
16. Correlate expected watcher event
17. If current revision > R, remain dirty and schedule another save
```

---

### Minimal save preparation

Avoid an extensible “save participant” system initially.

The permitted default transformations should be very small:

- Ensure a new Clutter-created page has an ID
- Preserve intended encoding
- Preserve existing line endings
- Optionally enforce a final newline only if the user enables that policy

Do not automatically:

- Reflow paragraphs
- Reorder frontmatter
- Normalize all whitespace
- Reformat tables
- Rewrite links
- Regenerate the entire document from an AST

Those changes produce noisy diffs and conflict with human-readable canonical Markdown.

---

### Change detection

Use layered checks:

1. Current revision vs saved revision
2. Expected file size and modification time as a fast path
3. Content hash when metadata changed or is ambiguous
4. Actual content comparison when resolving a conflict

Modification time and size alone are not sufficient. Filesystems can have coarse timestamps, and an external editor can make a same-size replacement.

---

### Atomic replacement

For normal local files:

1. Create a uniquely named temporary sibling.
2. Write the complete encoded snapshot.
3. Flush the file.
4. Revalidate the original if a race remains possible.
5. Replace the destination atomically using the platform’s supported operation.
6. Flush the parent directory where practical.
7. Remove abandoned temporary files during startup cleanup.

Do not silently fall back to truncating the original if safe replacement fails. Keep the document dirty, retain recovery data, and show the save error.

This behavior fits Clutter especially well because users expect a local-first knowledge base to be more conservative with data than a generic text editor.

---

## I. External-change handling

### 1. Clean buffer, changed disk file

- Read and verify the new content.
- Apply it as a controlled external-reload transaction.
- Preserve cursor and selection using mapped anchors where possible.
- Update base snapshot.
- Reparse the Page.
- Update catalog and index.

Avoid destroying and recreating the editor model, because that can lose undo, selection, folds, and plug-in state.

For undo, choose one clearly documented policy:

- Make external reload a barrier and preserve the previous text in recovery history, or
- Add one labeled undoable external-update transaction

A barrier is simpler and less surprising initially.

---

### 2. Dirty buffer, changed disk file

Pause auto-save.

Read the external file and perform a three-way merge:

```text
Base: last loaded/saved Clutter version
Local: current Clutter buffer
Remote: current disk version
```

#### Clean non-overlapping merge

- Apply the merge as one labeled editor transaction.
- Keep the document dirty.
- Update the base to the external disk version.
- Show a non-modal notification.
- Resume auto-save.

#### Overlapping merge

Enter `Conflict` state.

Present:

- Inline conflict regions or side-by-side diff
- Keep Clutter Version
- Accept Disk Version
- Edit Merged Version
- Save Copy

Never let the debounce timer overwrite the external file while this state is unresolved.

---

### 3. External deletion

#### Clean document

- Mark it orphaned.
- Keep the buffer visible temporarily.
- Offer Close or Recreate.

#### Dirty document

- Preserve buffer and recovery snapshot.
- Pause auto-save.
- Offer Recreate, Save As, or Close Without Saving.

---

### 4. External rename

Try to bind the new path to the same Page ID.

If the embedded Page ID is available, this is straightforward. Otherwise use recent watcher pairing and fingerprints.

Update:

- PageDocument path
- Catalog mapping
- Open-tab label
- Relative-link calculations
- Any pending save destination

---

### 5. Clutter’s own watcher events

Each successful save should record an expected event signature:

- Page ID
- Old and new fingerprint
- Operation token
- Path
- Completion time

When the watcher reports the change, Clutter should acknowledge it rather than rereading and replacing the buffer.

Do not suppress events merely by time window; an external editor can change the same file immediately after Clutter saves it. Confirm by fingerprint.

---

## J. File-watching architecture

### Normal operation

Use one recursive watcher per vault where the platform allows it.

Pipeline:

```text
OS watcher event
    ↓
Normalize path
    ↓
Ignore excluded and temporary paths
    ↓
Coalesce related events for 50–200 ms
    ↓
Correlate with Clutter operation records
    ↓
Stat affected path
    ↓
Read/hash only if needed
    ↓
Update affected PageDocument and catalog entry
```

### Exclusions

At minimum:

- Clutter application cache
- Temporary safe-save files
- `.git`
- Common dependency/build directories
- User-configured exclusions
- Hidden cloud-provider artifacts where appropriate

### Recovery from watcher loss

Perform a reconciliation:

- At vault startup
- After system resume
- After watcher overflow
- After the vault root is reconnected
- When a cloud provider reports broad changes

The reconciliation should compare catalog fingerprints with the filesystem, not blindly reparse every file.

---

## K. Catalog updates

Use two layers.

### Durable catalog

Represents the last known disk-backed state.

Updated after:

- Successful Clutter save
- Verified external file change
- File creation
- Rename
- Deletion
- Startup reconciliation

### Volatile open-document overlay

Represents unsaved state for open documents.

For example, while a user edits a title:

- The sidebar can show the new title immediately.
- Search can find the new text.
- Backlinks can reflect the new outgoing link.
- The durable catalog still records what is on disk.

On successful save, merge the overlay into the durable record.

On discard or external reload, drop or replace the overlay.

This avoids choosing between immediate UI and honest durable state.

---

## L. Index updates

### Link and metadata index

After a buffer transaction:

1. Incrementally parse the changed region.
2. Determine whether frontmatter, headings, tags, or links were affected.
3. Update the open-document overlay only for those fields.
4. On save, commit the resulting edges and metadata under revision R.

When one page changes its outgoing links, update:

- Its outgoing-edge set
- Backlinks for old destinations removed
- Backlinks for new destinations added

Do not rebuild the entire link graph.

### Full-text index

Recommended policy:

- Maintain a durable index of saved Markdown.
- Maintain an in-memory overlay for open dirty pages.
- Search returns durable results plus overlay substitutions.
- Commit the page to the durable index after a successful save.

This guarantees that the durable search database never claims content exists on disk when it does not.

### Stale-result prevention

Every indexing request carries:

- Page ID
- Buffer or disk revision
- Content fingerprint

A result is committed only if those still match.

---

## M. Undo and auto-save in Clutter

Use the editor framework’s transaction history.

Recommended rules:

- Group ordinary typing by timing and cursor continuity.
- Separate paste, delete, format, move, and link actions.
- Auto-save creates no transaction.
- Catalog and index updates create no text transaction.
- External clean reload creates an explicit history barrier.
- Successful non-overlapping external merge creates one labeled transaction.
- Manual save creates no history boundary.
- Undo to text equivalent to the saved snapshot clears dirty state.
- Redo can make it dirty again.
- Do not persist full undo history across restarts in the first version.

Persistent undo is valuable but not foundational. Recovery snapshots provide the more important safety guarantee first.

---

## N. Large-file behavior

Introduce explicit thresholds.

For a very large Markdown file:

- Keep the editor buffer fully usable.
- Render only the viewport.
- Limit live preview transformations.
- Parse incrementally and cancel stale work.
- Extract headings and links in background chunks.
- Disable expensive diagnostics or decorations.
- Avoid storing multiple full string copies.
- Stream encoding to the temporary file when supported.
- Show that reduced functionality is active.

The text itself must remain editable even when optional intelligence is reduced.

---

## O. Progressive implementation plan

### Phase 1: safe single-process editor

Build:

- One PageDocument per path/Page ID
- Editor buffer
- Dirty and saved revisions
- One-second debounced auto-save
- Five-second maximum latency
- Manual flush
- Atomic replacement
- Save serialization
- Basic file watcher
- Clean external reload
- Dirty external conflict prompt
- Rebuildable catalog
- Incremental metadata parsing

This gives Clutter a correct core lifecycle.

### Phase 2: resilience and scale

Add:

- Recovery snapshots
- Three-way merge
- Watcher overflow reconciliation
- Volatile index overlays
- Content hashing
- Background full-text indexing
- Rename detection
- Large-file feature thresholds

### Phase 3: advanced history and synchronization

Only after real demand:

- Persistent undo
- Local version history
- Content-addressed snapshots
- Cross-device sync protocol
- Operation journal
- Optional collaboration

Do not begin with CRDTs or a Notion-style transaction server. They solve problems Clutter does not yet have and would weaken the minimal, file-canonical architecture.

---

# Recommended final data flow

```text
                         ┌──────────────────┐
                         │ Filesystem/Vault │
                         └─────────┬────────┘
                                   │ read/watch/write
                         ┌─────────▼────────┐
                         │  PageDocument    │
                         │ id/path/revisions│
                         │ disk/base state  │
                         └─────────┬────────┘
                                   │ owns
                         ┌─────────▼────────┐
                         │  Editor Buffer   │
                         │ text/transactions│
                         │ undo/snapshots   │
                         └──────┬─────┬─────┘
                                │     │
                  transactions  │     │ snapshots
                                │     │
                      ┌─────────▼─┐ ┌─▼──────────────┐
                      │ Runtime   │ │ SaveCoordinator│
                      │ Page      │ │ debounce/conflict
                      │ projection│ │ atomic replace │
                      └─────┬─────┘ └──────┬─────────┘
                            │               │ success R
                     volatile updates      │
                            │               │
                 ┌──────────▼───────────────▼──────┐
                 │ Vault Catalog and Indexes       │
                 │ durable state + dirty overlays  │
                 └─────────────────────────────────┘
```

---

# Final recommendation

Clutter should adopt a deliberately asymmetric architecture:

- **The editor buffer is authoritative while a page is open.**
- **Markdown is authoritative for durable user data.**
- **The Runtime Page is a versioned interpretation.**
- **The Vault Catalog is a rebuildable registry.**
- **Indexes are disposable performance structures.**
- **Auto-save moves snapshots from buffer to Markdown.**
- **The watcher moves verified external changes from Markdown back into the buffer and catalog.**

The save boundary should be conservative, revision-aware, and atomic. The editing boundary should be fast, incremental, and transaction-based. The indexing boundary should be asynchronous and disposable.

That division gives Clutter the responsiveness of a professional editor without sacrificing the transparency and portability of canonical Markdown.

[1]: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/textfile/common/textFileEditorModel.ts 'vscode/src/vs/workbench/services/textfile/common/textFileEditorModel.ts at main · microsoft/vscode · GitHub'
[2]: https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.ITextModel.html?utm_source=chatgpt.com 'ITextModel | Monaco Editor API - microsoft.github.io'
[3]: https://codemirror.net/docs/guide/?utm_source=chatgpt.com 'CodeMirror System Guide'
[4]: https://zed.dev/blog/zed-decoded-rope-sumtree "Rope & SumTree — Zed's Blog"
[5]: https://zed.dev/docs/multibuffers?utm_source=chatgpt.com 'Multibuffers | Multibuffers - Edit Multiple Files at Once in Zed'
[6]: https://docs.obsidian.md/Plugins/Editor/Editor%2Bextensions?utm_source=chatgpt.com 'Editor extensions - Developer Documentation'
[7]: https://docs.obsidian.md/Plugins/Vault?utm_source=chatgpt.com 'Vault - Developer Documentation'
[8]: https://support.typora.io/Quick-Start/?utm_source=chatgpt.com 'Quick Start - Typora Support'
[9]: https://support.typora.io/Auto-Save/ 'Auto Save - Typora Support'
[10]: https://bear.app/faq/where-are-bears-notes-located/ "Where are Bear's notes located"
[11]: https://bear.app/faq/x-callback-url-scheme-documentation/?utm_source=chatgpt.com 'X-callback-url Scheme documentation - Bear Markdown Notes'
[12]: https://www.craft.do/blog/in-house-sync-protocol "The story of Craft's in-house sync protocol"
[13]: https://www.notion.com/blog/data-model-behind-notion "The data model behind Notion's flexibility"
[14]: https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite 'How we sped up Notion in the browser with WASM SQLite'
[15]: https://code.visualstudio.com/docs/editing/codebasics 'Basic editing'
[16]: https://zed.dev/docs/reference/all-settings 'All Settings | All Settings'
[17]: https://forum.obsidian.md/t/plugin-autosave-control-delay-automatic-saves-keep-manual-saves-immediate/104651?utm_source=chatgpt.com 'Plugin: Autosave Control – Delay automatic saves, keep manual saves ...'
[18]: https://bear.app/faq/sync-troubleshooting/?utm_source=chatgpt.com 'Bear Pro Sync Troubleshooting'
[19]: https://docs.obsidian.md/Reference/TypeScript%2BAPI/Vault/process?utm_source=chatgpt.com 'process - Developer Documentation'
[20]: https://github.com/zed-industries/zed/pull/51991/files?utm_source=chatgpt.com 'Reload remote buffers on external file changes with unchanged metadata ...'
[21]: https://github.com/zed-industries/zed/discussions/31021?utm_source=chatgpt.com 'Redo buffer is cleared when saving a file - GitHub'
[22]: https://obsidian.md/help/plugins/file-recovery?utm_source=chatgpt.com 'File recovery - Obsidian Help'
[23]: https://github.com/microsoft/vscode/issues/138850?utm_source=chatgpt.com 'Opened editor can end up empty after a file change on disk'
[24]: https://github.com/microsoft/vscode/issues/119002?utm_source=chatgpt.com 'Use a content hash for dirty write protection instead of ... - GitHub'
[25]: https://forum.obsidian.md/t/editor-add-a-toggle-to-disable-automatic-merging-of-changes-non-obsidian-sync/14874?utm_source=chatgpt.com 'Editor: Add a toggle to disable automatic merging of changes (non ...'
[26]: https://zed.dev/docs/reference/all-settings?utm_source=chatgpt.com 'All Settings | All Settings - zed.dev'
[27]: https://support.typora.io/File-Management/?utm_source=chatgpt.com 'File Management - Typora Support'
[28]: https://bear.app/faq/how-bear-pro-handles-conflicted-notes/?utm_source=chatgpt.com 'How Bear Pro handles conflicted notes'
[29]: https://github.com/microsoft/vscode/wiki/File-Watcher-Internals?utm_source=chatgpt.com 'File Watcher Internals · microsoft/vscode Wiki · GitHub'
[30]: https://docs.obsidian.md/Reference/TypeScript%2BAPI/Vault/on%28%27modify%27%29?utm_source=chatgpt.com "on('modify') - Developer Documentation"
[31]: https://github.com/zed-industries/zed/issues/59610?utm_source=chatgpt.com 'Queued rescan events trigger repeated worktree scans after watcher ...'
[32]: https://docs.obsidian.md/Reference/TypeScript%2BAPI/MetadataCache?utm_source=chatgpt.com 'MetadataCache - Developer Documentation'
[33]: https://zed.dev/blog/crdts "How CRDTs make multiplayer text editing part of Zed's DNA — Zed's Blog"
[34]: https://github.com/Microsoft/monaco-editor/issues/239?utm_source=chatgpt.com 'Editor serialization · Issue #239 · microsoft/monaco-editor - GitHub'
[35]: https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/model/pieceTreeTextBuffer/pieceTreeBase.ts?utm_source=chatgpt.com 'vscode/src/vs/editor/common/model/pieceTreeTextBuffer ... - GitHub'
[36]: https://github.com/microsoft/vscode/issues/138822?utm_source=chatgpt.com "Viewport tokenization heuristic doesn't work well for PHP files"
[37]: https://lezer.codemirror.net/docs/guide/?utm_source=chatgpt.com 'Lezer System Guide - CodeMirror'
[38]: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/codeEditor/browser/largeFileOptimizations.ts?utm_source=chatgpt.com 'vscode/src/vs/workbench/contrib/codeEditor/browser ... - GitHub'
[39]: https://support.typora.io/Trouble-Shooting/?utm_source=chatgpt.com 'Trouble Shooting - Typora Support'
[40]: https://www.notion.com/blog/how-we-made-notion-available-offline 'How we made Notion available offline'
