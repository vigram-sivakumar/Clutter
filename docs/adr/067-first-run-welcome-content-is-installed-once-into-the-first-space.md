# ADR-067: First-run welcome content is installed once into the Space Clutter creates at first run, through the Gate, never into an existing folder

**Status: Proposed.** Direction approved: Route G (Gate-routed, after the Space opens) with Option B (per-Space ledger), three attempts in total. The specification amendment below is applied to `architecture-specification.md` (§6, §6a, §7, §11); `ARCHITECTURE_RULES.md` and `implementation-rules.md` are unchanged. The status stays Proposed until the implementation and its verification are complete, which includes the real-app acceptance list at the end (not yet done).

## Context

Clutter ships a set of welcome notes (`apps/app/src/welcome-content/Welcome to Clutter/`): 22 Markdown notes (11 templates, the "Welcome to Clutter" guide and its "Markdown essentials" notes), two `.folder.md` files and one image. The outer `Welcome to Clutter/` directory is the source Space root. Its contents (`Assets/`, `Templates/`, the inner `Welcome to Clutter/`) are installed directly into the user's first Space, with no extra folder level, so the 20 path-form wiki links (`[[Welcome to Clutter/Markdown essentials/Lists]]`) resolve. `LinkResolver` matches a link by exact vault-relative path, then by alias.

Requirements (unchanged):

- Installed once, only when Clutter creates the initial Space through the Welcome flow. Never when adding Spaces, switching Spaces or recovering a Space.
- If the user chooses an existing folder at first run, nothing is installed and the first-run decision is permanently complete.
- Never overwrite a file. Never bring back a welcome note the user deleted.
- IDs, frontmatter, Markdown, filenames, folder structure and image bytes arrive exactly as shipped, wherever the architecture permits. `.DS_Store` is excluded.
- `Get started.md`'s cover (`Assets/photo-1654372066413-6ced0e759ee7.jpg`) points to a file that is not shipped. It is installed as written and left unresolved. `Typewritter.jpg` is not substituted and no credit is invented.

## Spike results (run, not inferred)

A temporary test (`welcomeSpike.spike.test.ts`, 12 tests, since deleted; the working tree is as it was) drove the real `PagePersistenceCoordinator`, the real `Vault`, `FrontmatterParser`, `PageBuilder`, `FolderBuilder`, `MoveService`, `VaultSyncService` and `reconcileVaultTemplateMetadata`, over `AtomicWriteFileSystem` with `InMemoryAtomicVaultWriter` (the production write stack with the in-memory writer, which enforces the four write intents, including create-only). It installed the **actual shipped files** from disk through the proposed sequence (reserved `Templates/`; `create-folder` with the shipped `.folder.md`; `create` with the shipped note text and the frontmatter id as the queue key). All 12 passed. The Rust tests for the native writer were also run (`cargo test --lib a_create` and `new_file_no_clobber`, in a scratch target directory): 4 and 20 passed.

| # | Question | Result |
|---|---|---|
| 1 | A Gate `create` with the id already in the frontmatter preserves that id and the content | **Yes.** 22 notes and 2 `.folder.md` files were byte-identical to the source (`Buffer.compare` = 0 for every file). Each page's id equals its shipped id, and `vault.getPage(shipped).path` is right. The Vault's `source.markdown` equals the shipped body. Both folder ids equal their shipped ids. The image's bytes are identical. `Templates/` is a reserved folder with no `.folder.md`, as shipped. |
| 1b | What if the queue key differs from the frontmatter id | The page is built with the **frontmatter** id. The key is only the queue slot. Harmless, but the entry should pass the frontmatter id. |
| 2 | Sync's template-marker reconciliation (ADR-041) leaves the shipped files alone | **Yes.** After the install, `reconcileVaultTemplateMetadata` (the startup pass) and `VaultSyncService.reconcileKnownPath` on all 25 files made **0 writes** and changed **0** files; the Vault held 22 pages. **Control:** a template note placed *outside* `Templates/` was rewritten by the same reconcile (`kind: template` removed), so the zero is not a vacuous result. |
| 3 | Nested folder creation and id chaining | **Yes.** `Markdown essentials` has the inner folder's id as `parentId`; the inner folder's `parentId` is null; `Lists.md` is a child of `Markdown essentials` (10 children), `Meeting Notes.md` of `Templates`. Two independent installs gave identical page and folder ids, paths and parents. |
| 3c | A wrong parent id | **Hazard.** The Gate does not validate `parentId`: with `'UNRESOLVED'` the file was written and the Vault accepted a page whose parent does not exist. The entry point must resolve every parent id from a Gate result, never guess it. |
| 4a | Existing note at the target path (unknown to the Vault) | **Refused.** `AtomicNotCommittedError`, disk still `USER CONTENT`, no page in the Vault. |
| 4b | Existing `.folder.md` | **Refused.** Same error, disk still `USER FOLDER`, no folder in the Vault. |
| 4c | Existing image | **Refused.** `DestinationExistsError`, bytes intact. |
| 4d | A second `create` for an id the Vault already holds | **Hazard.** The Gate turns it into a *save* (by design, ADR-017 §4): the note's body was replaced **and** its frontmatter regenerated (`favorite`, `status` added). Create-only intent does not protect this path. |
| 4e | `create-folder` over an existing directory with no `.folder.md` | **Hazard.** It succeeds and adds a `.folder.md` to that directory (existing files intact). |

What the spike did **not** establish: the real native writer through the app, the packaged or sandboxed build, and `Application.bootstrap()` itself (it needs the Tauri runtime). The native create-only guarantee rests on the Rust tests above and the existing `a_create_*` and `new_file_no_clobber` suites.

**What the hazards mean for the design.** 4d, 3c and 4e are not bugs to fix in the Gate (the Gate is correct for its general callers). They are cases the one new entry point must refuse before it enqueues. They are guarded in the entry point and covered by tests (below), and the ledger guarantees an entry is never started twice.

## Findings from the specification and the compliance checklist

1. Gate `create` and `create-folder` write the content they are given, with create-only intent (confirmed by the spike); ADR-063's regeneration is a property of `save`.
2. `PageOperations`/`FolderOperations` have no verbatim create. `PageOperations.create` builds its own content.
3. `ARCHITECTURE_RULES.md` rule 1's amendment already allows "a narrow, singular, system-triggered, fixed-target workflow enqueuing directly through the Gate", provided the write still lands through the one Gate and it stays singular. It has no live instance today.
4. Checklist Persistence rule 5 and ADR-030 close the pre-open route for page content and for creating `Templates/`. Route G uses neither: pages and folders go through the Gate, and `Templates/` through `FolderOperations.ensureReservedFolder`.
5. Assets are outside the Gate's scope (rule 2) and are registered with `reconcileKnownPath` (ADR-040).

Route P (a pre-open, filesystem-only install with a written-out exception) was considered and is not chosen. It is recorded under Alternatives.

## API owner for verbatim creation

Two candidates, compared on responsibility:

| | `PageOperations` | `FolderOperations` |
|---|---|---|
| What the install needs from it | create 22 notes, content verbatim, id from frontmatter | create 2 folders, `.folder.md` verbatim, parent ids chained; `Templates/` via its existing `ensureReservedFolder` |
| Existing Gate kind it would use | `create` | `create-folder` |
| Existing behavior it must not touch | `create()`'s own content building, drafts, sessions, `Workspace` | `create()`'s own `.folder.md` building |
| Facade invariant that applies | never calls `VaultFileSystem`, exactly one `enqueue` per disk-changing method | the same |

**Recommendation: one narrow method on each, each owning its own aggregate, plus a small orchestrating service that owns neither.**

- `PageOperations.createFromSource(source)` and `FolderOperations.createFromSource(source)`. Each wraps exactly one existing Gate kind. This is the smallest surface that keeps rule 1 true (each aggregate's writes stay on its own facade) and needs no new `PersistenceOperation` kind. A single method on one facade that created both pages and folders would blur the aggregate boundary rule 1 exists to keep.
- Each method takes a `ShippedSource` (`{ path, parentId, content }`) that only the welcome-content manifest module can construct (an opaque branded type). That keeps it from being a second general-purpose creator, which is what rule 1's regression signature forbids. It is also not reachable from any UI control.
- Before enqueuing, each method refuses (returns `skipped`, never throws, never enqueues) in the cases the spike found the Gate would mishandle: the id (carried by the source, read once from the content's frontmatter by the manifest; a file without an id is rejected) already resolves in the Vault; the path already resolves in the Vault (pages); the parent is not a live, non-archived Vault folder. These checks read `Vault` only, never `VaultFileSystem`.
- **The three guards under the real queue and mutation model** (checked by tests, including a stale-check test):
  1. *An existing Vault id never turns a source creation into a save.* The Gate's `runCreate` looks up `vault.getPage(pageId)` with the **queue key** it is given. The facade passes `shippedSourceQueueKey(source)` (`shipped-source:<path>`), which is never a page id, so that branch is structurally unreachable, whatever the Vault holds at dequeue time. If the id does appear between the check and the write, the create-only write still lands at its own path (nothing is overwritten), the Vault refuses the duplicate id, and the facade throws; the existing page's file is untouched (`createFromSource.test.ts`, "stale check").
  2. *An unresolved `parentId` is rejected before any write is enqueued.* The Vault reads and the `enqueue` call share one synchronous turn and Vault mutation is synchronous, so nothing can change the Vault between them. What remains between the call and the queued write is benign: if the parent's directory has gone, the create-only write fails and nothing is written; a Vault entry that diverges is reconciled by Sync. The Gate itself never validates `parentId`, which is why the facade must.
  3. *An existing directory without `.folder.md` never receives a marker.* A `ShippedFolderSource` can only be obtained after the service created that directory with `createDirectory(path, { exclusive: true })`, which is decided by the filesystem at creation and refuses anything already there (folder, file, link). A Vault read performed earlier could be stale; the exclusive create cannot be. A refused directory ends that entry, and everything shipped inside it is skipped (its parent id is unresolved), leaving the user's directory and files untouched.
- `ShippedPageSource` and `ShippedFolderSource` are opaque (a brand symbol that is not exported). The mint functions are imported only by the welcome-content folder, and `ShippedSource.test.ts` enforces that, and that nothing else calls `createFromSource`, and that the Gate has no `createOnly` flag. No unrestricted verbatim-write API is exposed.
- Orchestration (order, the ledger, resume, the notice) lives in `application/welcome-content/WelcomeContentService`, which calls the two facade methods, `ensureReservedFolder`, a non-Gate binary write, and `reconcileKnownPath`. It enqueues nothing itself. This follows `DailyNoteService`, an application-layer service that calls `FolderOperations.ensureReservedFolder` and decides nothing about persistence. It is not a new facade or aggregate, so rule 1's "new aggregate" clause does not apply.
- `Application` constructs it once in `attachVault()` (the Composition Root only wires) and exposes it as a read-only field. The first-run decision and the app-level record live in `app/spaces`, beside the registry, and call it once the Space has opened.

How the new entry fits the existing rules:

| Rule | Fit |
|---|---|
| 1 One owner per capability | Each aggregate's creation stays on its facade. The two methods are the single, narrow, system-triggered instance rule 1's amendment allows. A second such instance anywhere is the signal to generalize. |
| 2 One write path | Every page and folder write is a Gate `enqueue` (`create`, `create-folder`, `ensure-reserved-folder`). The image is non-Gate under rule 2's scope clause, as `importAsset` already is. |
| 3 Vault mutation | Only the Gate mutates the Vault. The service reads it. |
| 4 Platform | No `VaultFileSystem` call in either facade. The image write goes through the injected file system. |
| 5 Business rules in facades | "Skip if the id or path exists, or the parent is unknown" is decided in the facade, not in the Gate. |
| 7 Dependencies point downward | The service sits in `application/`, depends on the facades, the manifest (a plain module) and Platform types. |
| ADR-030 | `Templates/` is created by `ensureReservedFolder` only. |
| ADR-040 | The image is reconciled with `reconcileKnownPath` before the install is recorded as finished. |
| Checklist Persistence 1, 2, 4, 5 | All answer No. No new `PersistenceOperation` kind, so no new Gate handler. |
| Checklist Testing | New capability methods have a success path and validation-failure paths (below). |

### Specification amendment (applied to `architecture-specification.md`)

Applied as written below; the specification text is the authority and says the same.

- **§6 `PageOperations`, public API:** `createFromSource(source: ShippedPageSource): Promise<CreateFromSourceOutcome>`, with `CreateFromSourceOutcome = { status: 'created'; id } | { status: 'skipped'; reason: 'id-exists' | 'path-exists' | 'parent-unknown' }`. It is the one narrow, system-triggered verbatim create, enqueuing exactly one Gate `create` with `source.content` unchanged.
- **§6 Invariants (added):** `createFromSource()` never builds content (no `PageCreator`), refuses without enqueuing in the three cases above, runs its checks and its `enqueue` in one synchronous turn under a queue slot that is never a page id, writes create-only, never opens a draft or session, never touches `Workspace`, and is not reachable from a UI control.
- **§7 `FolderOperations`, public API:** `createFromSource(source: ShippedFolderSource): Promise<CreateFromSourceOutcome>`, one Gate `create-folder` with the `.folder.md` unchanged, the same invariants, and a source that can only be minted after an exclusive directory create. `ensureReservedFolder('templates')` is unchanged and remains the only way `Templates/` is created.
- **New §6a, `WelcomeContentService`:** responsibilities, `install()` and `resumeIfNeeded()`, collaborators, lifecycle, the invariants of the recovery contract, ownership and testing.
- **§11:** `attachVault()` also constructs `WelcomeContentService`.
- **Not amended:** `ARCHITECTURE_RULES.md` (rule 1's existing amendment already covers this) and `implementation-rules.md`. The Gate (§5) is unchanged: no new operation kind and no new flag.

## Decision (proposed)

1. **Trigger: one outcome only.** The `{ path }` result of `createSpaceFolder` inside the Welcome dialog's `createFolderOrOpenChosen` (`AppShell.tsx`). That is the only place Clutter creates a Space folder and the only consumer of the dialog's `onCreateFolder`. The path is remembered for the open that follows. Selecting a folder, the Documents panel's "other folder" choice (`openFolder`), recovery, switching and adding Spaces never reach it.
2. **When it runs: before the Space is shown (amended after the first real-app run; see "First real-app run" below).** The install runs against the Application that has just been opened (so the Gate and Sync that make the writes are the running ones) but before that Application is handed to the UI and before the Space is remembered. The Welcome dialog stays up, with Create disabled and reading “Creating…”. The install starts only if the opened Space's Vault holds no pages, folders or resources; anything else records `skipped-existing-folder`.
3. **First-run record, application-level, beside the Space registry** (ADR-056; same storage, separate key `clutter.welcomeContent`). The registry cannot stand in for it: it empties again whenever a user removes all Spaces, and during lost-Space recovery. `state` is `started`, `done`, `skipped-existing-folder` or `skipped-existing-user`. It is written `started` before any content is written. Any record means the first-run decision is made and a fresh install never starts again. At startup, a registry that already holds a Space with no record is backfilled `skipped-existing-user`. Unavailable storage means no install. A fresh data store (new bundle identifier, cleared app data) is a new user by definition.
4. **Order of work, all awaited and sequential:** `.clutter` is ensured (`ensureClutterDirectory`); the ledger is created; then entries run in the manifest's sorted order (parents before children). `Templates/` via `ensureReservedFolder`; each other folder via `FolderOperations.createFromSource` with the parent id taken from the previous result; each note via `PageOperations.createFromSource`; `Assets/` (no `.folder.md`; an exclusive directory create, outside the Gate under rule 2's scope clause) then the image by `writeBinaryFile` at its exact path, then `reconcileKnownPath`.
5. **Bundling:** one module owns the glob. `import.meta.glob` with `?raw` for `**/*.md` and `exhaustive: true` (the default drops dotfiles, which would lose both `.folder.md` files), and a separate `?url` glob for the image, fetched as bytes. Both lazy. `.DS_Store` is excluded by pattern and by an explicit negative pattern. Installed paths are the shipped paths with the outer folder stripped. The manifest is sorted, so its order is deterministic.
6. **No automatic overwrite, ever.** There is no replace code path: the Gate's create-only writes, exclusive directory creation and the never-replacing binary write are the only writes, and the entry points refuse before enqueuing in the spike's hazard cases.

## First real-app run: what failed, what changed

**What happened.** The first run in the real app showed the failure toast and an install that stopped at entry 14 of 27 (ledger `completed 14, inFlight true, attempts 1`): `Assets/`, the image and all 11 templates were installed, and the `Welcome to Clutter` folder had only its `.folder.md`.

**Root cause (reproduced, not guessed).** The installer created the folder's directory exclusively, *then* awaited the marker's text (a lazily loaded chunk in the app), then called the Gate. While it awaited, the OS watcher reported the new directory and Sync registered it under a path-derived id (no `.folder.md` yet). The Gate then wrote the marker (it is on disk with the shipped id) and `vault.addFolder` was refused: "Folder path already in use". The Gate returned `abandoned`, the facade threw, the install stopped and the ledger recorded a retry. The reproduction produced a ledger identical to the real one, including the plan digest. Sync never replaces the id of a folder it already tracks, so even a completed retry would have left that folder under the path-derived id until the next scan.

**Fix 1: remove the avoidable gap.** A marker's text and id are read before the exclusive directory create, so nothing yields between that create and the Gate write except the Gate's own file calls. This restores the timing of the application's own folder creation. A deterministic regression test reproduces the interleaving (a slow marker load plus a watcher reaction one macrotask after the create) and failed before the fix.

**This is not a proof that the race is gone.** The window is smaller, not closed: between the exclusive create and the marker write the Gate still performs a directory call and an atomic write, and the watcher's reaction can land there. A second test pins that case on purpose (the reaction lands exactly between the directory and the marker's write) and still fails the install, now reported as its own cause. A Sync-level safeguard (holding the path's lane for the duration of the create) would close it, but it is a Sync API change and a specification amendment, and is **not** made here. It is proposed only if the real app still shows the race.

**Fix 2: say what happened.** The Gate's `create` and `create-folder` return `abandoned` only after the write succeeded and the Vault then refused the entry. The facades now throw `WrittenButNotRegisteredError` for that, with the path, the kind (`page` or `folder`) and the Gate's own reason unchanged, instead of a generic failure.

**Fix 3: the first-run gate (new requirement).** A first-run Space is never shown while its welcome content is being installed.

- *Lifecycle inspected:* `openSpaceFromWelcome` selects the Space (the registry changes in memory only), opens an Application (`prepare`), and `commit()` then hands it to the UI (`setApplication`), applies the profile, and calls `confirmOpened()`, which is what persists the Space; the Welcome dialog stays up until `settle`, and a failure puts the registry back and shows the message in the dialog. `SpaceDetails` already keeps the created folder (`createdPath`) so a retry opens it again instead of creating another.
- *Smallest safe change:* the gate runs inside `commit()` after `prepared.open()` and before `setApplication`. The same single installation mechanism (`WelcomeContentService`, through the Gate and Sync) does the work; nothing is bypassed. A closed gate throws, so the existing failure path discards the Application, cancels the selection and shows the message in the dialog, which stays up with the retry.
- *Not shown until complete:* the Space is registered (`confirmOpened`), set active and marked `done` only after the install is complete and `verifyInstall` has confirmed all 27 entries (4 directories, 22 notes, both `.folder.md`, the image). A failure leaves the first-run record `started`, never `done`.
- *Retry:* pressing Create again reopens the created folder; the record is `started` and the folder is the one Clutter created, so the gate asks for the install again, which refuses by itself in a non-empty Space and resumes from the ledger. Nothing is overwritten and nothing deleted is restored.
- *Duplicate Create:* the button is disabled and reads “Creating…” for the whole create-and-open (`handleCreate` also ignores a click in flight).
- *Existing folder:* selecting one still skips the install and records the skip permanently. It opens at once, unless its own ledger holds an interrupted install (the folder is then Clutter's, and the gate finishes it first).
- *Messages* (dialog, inline above Create): “Couldn’t finish adding the welcome notes. Try again to continue where it stopped” when a retry will continue; “Couldn’t add all the welcome notes. Try again to open the space without them” when the ledger records that no retry will happen or the content could not be confirmed. After a terminal failure the next try opens the Space as it is: a gate that could never open would trap a first run behind a failure nothing can fix.
- *Spaces opened outside Welcome* (startup restore, recovery, switching) are never gated. They resume an interrupted install in the background and use the toast above.

**A refinement of the recovery contract (G6), needed by the gate.** A retry must be able to complete the install, but the ledger resolves the in-flight entry toward *not writing*, which would leave one note missing and make verification fail on every retry. That rule exists because a user may have deleted the file. A Space that has never been shown cannot have had a file deleted by its user. The ledger now records `shown`: `false` for an install made under the gate, set to `true` when the gate opens the Space (`markShown`), and absent (read as shown) in any ledger from an earlier build. For a never-shown Space only, the in-flight entry is attempted again with the same create-only write (a file already there refuses it and is left alone). For a shown Space G6 is exactly as before. The residual: someone deleting a freshly created file in Finder, outside the app, in the interval between an interrupted install and its retry.

## Recovery: Option B, the contract

### Why B

Option A (never retry) leaves a permanent partial install after a crash. The requirement is both "no permanent partial install" and "never restore or overwrite", and only B satisfies both. B costs one counter, an attempt count and a plan hash, not a manifest of file hashes.

### The ledger

The `welcomeInstall` key of the Space's own `.clutter/workspace.json`, written through the existing serialized merge writer (`mergeAndWriteWorkspaceStateFile`, which also quarantines a corrupt file). No new reserved file.

```
welcomeInstall: {
  version: 1,
  plan: "<SHA-256 of the sorted paths and the bundled bytes of every entry>",
  total: 27,          // entries: 4 directories, 22 notes, 1 image (each .folder.md belongs to its directory)
  completed: n,        // entries 0..n-1 are finished and are never looked at again
  inFlight: boolean,   // true while entry n is being written
  attempts: number,    // install attempts so far, the first install included
  state: "installing" | "complete",
  outcome?: "installed" | "abandoned"
}
```

`plan` covers paths **and bytes** (Markdown text and image bytes), so changed content with the same paths still counts as different. It is computed only when an install or resume actually runs.

### The write protocol (per entry n)

1. Write `{ completed: n, inFlight: true }` and wait for it.
2. Perform entry n with its create-only write (a Gate `create`/`create-folder`, or the create-only binary write).
3. On success, or on a refusal whose reason is `destinationExists` or a facade `skipped`, write `{ completed: n+1, inFlight: false }` and continue. After the last entry, write `state: "complete", outcome: "installed"`; the key stays as a tombstone.
4. On any other failure (permission, space, an uncertain write), stop. Entry n stays `inFlight`.

A refusal is classified by **type**: `AtomicNotCommittedError.reason === 'destinationExists'` (a distinct `NotCommittedReason`, already in `PERMANENT_NOT_COMMITTED_REASONS`), or a facade `skipped` outcome. Never by message text, and never by an `exists()` check.

### The contract (what is guaranteed, and by what)

| # | Guarantee | Mechanism |
|---|---|---|
| G1 | No existing file is overwritten | Create-only Gate writes and never-replacing binary write (spike 4a, 4b, 4c; Rust `a_create_*` and `new_file_no_clobber`). The facade entries refuse before enqueuing when the id or path exists in the Vault, so the Gate's create-becomes-save path (spike 4d) is unreachable. No replace code path exists. |
| G2 | A welcome file the user deleted after installation is never recreated | Entries below `completed` are never reopened, whether or not their file still exists. A finished install is `state: "complete"`, which resume never touches. |
| G3 | A completed installation never runs again | `state: "complete"` in the Space, and the application-level record (`started`/`done`/`skipped-*`), which blocks a fresh install. |
| G4 | A partial installation is never continued with different bundled content | On resume, `plan` is recomputed from the current bundle. A mismatch sets `state: "complete", outcome: "abandoned"` and writes nothing. |
| G5 | A crash or failed write cannot cause an overwrite or a restore | Resume never writes an entry below `completed` or the in-flight entry (below). It writes only never-started entries, each with the same create-only write and the same refusals. |
| G6 | For a Space the user has seen, the in-flight entry is never written on resume | Ambiguity is resolved toward not writing (below). For a Space never shown (`shown: false`, only under the first-run gate) it is attempted again, create-only. |

### Resume

Runs when a Space whose ledger says `state: "installing"` is opened (one small read of a file the open already reads), after the Space is open. It increments `attempts` first.

- `plan` differs from the bundle: set `complete`/`abandoned`; install nothing (G4).
- Entries below `completed`: skipped (G2, G5).
- Entry `completed` with `inFlight: true` (the crash or failure fell inside its write): finished **without writing**, whatever the disk shows. An absent file could mean never written or deleted since; a present file could be the installer's or not. Comparing its bytes with the bundle would change nothing (both answers end the entry unwritten), so no comparison is made. A file that is there is only registered with the Vault (`reconcileKnownPath`, read-only), never written.
- Entries above that were never started, so their absence is the natural state. They are written in order, through the same protocol.
- If `attempts` has reached 3, or the failure was permanent, set `complete`/`abandoned` and stop.

### The unavoidable limitation

If the app crashes or a write fails during entry n, the ledger cannot tell whether that one file was never written, or was written and then deleted by the user before the next launch. Writing it risks resurrecting a deleted note; not writing it risks one missing note. This ADR chooses to risk the missing note, because resurrecting user-deleted content is the failure the requirements forbid. **After an interrupted install, at most one welcome note (the one in flight) may be missing**, and it is not recreated. No other mechanism (existence checks, content hashes of past state, a second marker file) can resolve this without risking a resurrection, and none is introduced.

Other limits: a lost or corrupt ledger means no resume (nothing runs). A user file created at an in-flight path during the install is refused and left alone. If the ledger cannot be written at all, a retry may still be attempted on a later open because the last written state says `installing`; the "no retry" notice below cannot be made strictly true in that one case.

## Failure notice

This toast is for an install that stops **after** its Space is already shown: a Space opened outside the Welcome dialog that resumes an interrupted install in the background. A first-run Space is never shown while its install is unfinished, so its failures are shown in the Welcome dialog instead, as the gate messages above.

Surface (`docs/writing-principles.md`, principle 11): a **toast**, the brief non-blocking outcome of an action. No decision and no unsaved content is involved. It is shown once per failure event, for one cause, and belongs to this Space. Existing toast conventions: sentence case, no ending period, typographic apostrophes, no urgency or blame, "space" lowercase mid-sentence. Neither string says or implies that existing files are damaged.

| When | Copy |
|---|---|
| **A retry is recorded** (`retry: 'scheduled'`) | “Some welcome notes couldn’t be added yet. Clutter will try again next time you open this space” |
| **No retry is recorded** (`retry: 'none'`) | “Some welcome notes couldn’t be added. Your space is ready to use” |
| **The ledger could not be written, so the state is uncertain** (`retry: 'unknown'`) | “Some welcome notes couldn’t be added. Clutter may try again next time you open this space” |

The first string is shown **only** when all three hold at the moment of the failure: the failure is retryable (its reason is not in `PERMANENT_NOT_COMMITTED_REASONS`); `attempts` is below 3; and the ledger write recording the retry **succeeded**. A permanent failure, the third failed attempt, a `plan` mismatch and an unreadable bundle write `complete`/`abandoned` and show the second string, once that write has succeeded. **When a ledger write fails** (the ledger could not be created, advanced, or updated with the outcome) the service cannot know what the next open will do: the last state on disk, if any, still says `installing`, so a resume may happen. Neither promise is made; the third string says only that a retry may happen. If the ledger could not even be created, nothing was written and no resume exists (the Space is untouched), and the notice is the second string. A successful install and a skipped one (existing folder) show nothing, since the notes are visible on their own. Tests assert each mapping and that the first string is never produced without a recorded retry.

## Alternatives considered

- **Route P: a pre-open, filesystem-only install with a written exception to rule 2, checklist Persistence 1 and 5, and ADR-030.** Not chosen. It reopens the page-content bootstrap exception ADR-011 and ADR-014 closed on purpose, and creates `Templates/` outside ADR-030's two sanctioned primitives. Route G reaches the same files through the Gate with no exception. Retained only as the fallback if the spike's assumptions fail under the real writer.
- **Create the notes through the general `PageOperations.create`.** Rejected: it builds its own content.
- **A single verbatim method on one facade that creates pages and folders.** Rejected: it blurs the aggregate boundary rule 1 keeps.
- **A new Gate operation kind.** Rejected: `create`, `create-folder` and `ensure-reserved-folder` already do the writes.
- **Harden the Gate so `create` never becomes a save (a `createOnly` flag).** Not proposed: it changes the frozen Gate API for one caller. The facade check closes the same hole. Revisit if a second caller appears.
- **Tauri `bundle.resources` read at run time.** Rejected: the filesystem scope is `$HOME/**` only, and dev and packaged paths differ.
- **Merge into an existing folder, skipping what exists.** Rejected by the requirement.
- **Derive "first run" from an empty registry.** Rejected: the registry empties again.
- **A separate ledger file, or a per-file hash manifest.** Rejected: a new reserved file for no gain, and a hash list answers "is this file as shipped", which resume does not need.
- **Guess the in-flight file from file existence.** Rejected: existence cannot tell never-written from deleted-since.

## Consequences

- A new user's first Space, created by the Welcome dialog's Create, opens with the welcome content a moment after it opens. Everyone else is unaffected.
- Every user gets the same frontmatter ids (the files ship them). Identity is path-based, so identical ids across Spaces are harmless.
- The Gate is unchanged. The spec gains two narrow methods and one application-layer service (the amendment above), and the checklist's rule 1 amendment gets its first live instance.
- The installed Unsplash covers need a network connection; each carries its `coverCredit` (ADR-054). `Get started.md`'s missing cover stays unresolved. `[[Inbox]]` resolves only once an Inbox folder exists (ADR-030, lazy).
- Remaining limitations: the one-note case above; the three Gate behaviors (4d, 3c, 4e) are guarded at the facade, not removed; the packaged, sandboxed app and `Application.bootstrap()` have not been exercised by the spike.

## Migration

None for stored formats. One new application-level key (`clutter.welcomeContent`), backfilled `skipped-existing-user` for existing users, and one new `welcomeInstall` key in the first Space's `.clutter/workspace.json`.

## Verification

### Automated (run; vitest over in-memory file systems and the in-memory atomic writer, not the real app)

Files: `welcomeContentManifest.test.ts`, `createFromSource.test.ts`, `WelcomeContentService.test.ts`, `ShippedSource.test.ts` (in `core/application/welcome-content/`), `welcomeContentRecord.test.ts` and `welcomeContentTriggers.contract.test.ts` (in `app/spaces/`), plus `resetSettings.storageKeys.test.ts` (the new storage key is classified as kept) and the existing `AtomicWriteContract.test.ts` boundary test, which still passes unchanged.

- **Manifest:** 4 directories, 22 notes and 1 image, no `.DS_Store`, no `.folder.md` as its own entry; identical to Node's view of the folder (the bundler glob drops and adds nothing); both `.folder.md` files byte-identical on their directories; every note and the image byte-identical to the source with the shipped paths; `Templates` reserved, `Assets` plain, directories before their contents; the plan digest differs for any change to a path, note, marker or image byte.
- **Entry points, success and validation-failure paths:** verbatim content and shipped id; exactly one enqueue, under a queue slot that is never the id; no draft, session or navigation; guard 1 (existing id skipped, with no write and the existing page not saved over, including when the id appears between the check and the write); guard 2 (unresolved or null parent rejected before any enqueue); path already in the Vault skipped; a file on disk the Vault does not know refuses the create-only write and is untouched; folders chain parents and keep their ids; guard 3 (an existing directory refuses the exclusive create that mints a folder source, and gets no marker; an existing `.folder.md` is refused and untouched).
- **Service and recovery:** the install writes every shipped file byte-identically with its own id and registers all 22 notes in the Vault, the image and both folders; every write outside the ledger is create-only (G1); the shipped path-form wiki links resolve in the installed layout; no start in a non-empty Vault; a second install never runs and a deleted note stays deleted (G3, G2); an existing file, directory or image is never overwritten and ends only its own entry; a retryable failure records the retry; resume finishes the install without writing the in-flight file (G5, G6) and without recreating a deleted note or folder (G2); an in-flight file that exists is left as it is and registered; a different plan abandons the install and writes nothing (G4), including a changed path list; three attempts in total with the third recording no retry, and a ledger already at the limit is abandoned without running; a permanent failure records no retry; an uncertain write is retryable; a corrupt or malformed ledger resumes nothing; ledger write failures give `unknown` and never `scheduled`, and a ledger that cannot be created writes nothing.
- **Notice:** each mapping, nothing for a success or a skip, and the writing-principles conventions.
- **Triggers:** Create installs after writing `started`; selecting an existing folder records `skipped-existing-folder` and a later Create never installs; startup restore, recovery and switching record `skipped-existing-user`; a second Space created later never installs; no storage or a refused record write means no install; a Space with an interrupted install resumes whatever was decided; the step never throws. The source contract tests assert the one call site, the one place the created flag is set, that it follows `confirmOpened()`, that only `runWelcomeContent` calls the service, and that `createFromSource` has only its three callers.
- **Not covered by automated tests:** `AppShell.tsx` itself (no render test was added: its Welcome flow is exercised only through the source contract and the unit tests of its pieces), and the real native writer (covered separately by the Rust tests named under Spike results).

### Added with the first real-app run's fix (automated)

`WelcomeContentService.test.ts` ("Sync watcher interleaving"): the regression reproducing the first failure (installs completely, both folders keep their shipped ids, both markers on disk as shipped, 22 notes registered in their folders, image present, nothing but create-only writes) and the residual race (fails, reported as `WrittenButNotRegisteredError` with path, kind and the Gate's reason). `verifyInstall` (all 27 entries, a missing note, a marker folder under the wrong id, nothing to verify). The never-shown Space rules (the in-flight file is attempted again, never overwrites, strict again once shown, a legacy ledger counts as shown). `prepareWelcomeSpace.integration.test.ts`: the gate against the real Gate, Vault and Sync (Create opens only when complete and verified; a failure keeps the Space closed with the record `started`; the retry on a fresh Application resumes and completes all 27 entries with only create-only writes; the retry never overwrites; three failed attempts then the next try opens; the watcher race closes the gate and the retry opens with shipped ids; a ledger that could not be created leaves the Space untouched; selecting an existing folder opens at once and installs nothing). `welcomeContentRecord.test.ts` and `welcomeContentTriggers.contract.test.ts` (the gate is called once, only for a Welcome open, before `setApplication` and before `confirmOpened`; Create is disabled and reads “Creating…”).

### Real-app acceptance (release requirement; NOT yet done)

To be run in the real app, kept apart from the results above, in both the normal development app and, where the harness permits, the sandboxed packaged app (`npm run dev:sandbox`, and a release build with a fresh test identity). Each must be recorded with what was and was not exercised:

1. Create a new initial Space from Welcome: the notes, folders, `Templates/` and `Assets/Typewritter.jpg` appear; frontmatter, ids, paths and image bytes match the shipped files; the Vault and the sidebar agree with the disk.
2. Select an existing folder at first run: nothing is installed, and a later Welcome Create never installs.
3. Restart after a simulated partial install (ledger `installing`): the install finishes on open, the in-flight note is not recreated, no existing file changes, and the toast reads correctly.
4. Existing files in the target stay untouched.
5. A deleted completed file is not restored by a resume or a restart.
6. New Space from the sidebar, Space switching, startup restore and lost-Space recovery never trigger the installer.
7. A watcher-race check on the folder markers: both `.folder.md` files arrive and both folders keep their shipped ids (the exclusive directory create precedes the Gate write, and Sync watches the same directory). The first real-app run failed here; the fix narrows the window and does not close it, so this must be repeated several times, in dev and in the sandboxed app.
9. The gate in the real UI: while the content installs the Welcome dialog stays up, Create is disabled and reads “Creating…”, and the Space is not visible or in the registry; after a forced failure the dialog shows the message and Create retries without creating a second folder; the Space is not remembered across a restart until the install has completed.
8. The unsupported-location and Documents-authorization paths in the sandboxed app.
