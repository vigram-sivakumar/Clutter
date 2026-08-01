# Architecture Compliance Checklist

Use this during PR review against `docs/architecture-specification.md`. It does not explain the architecture — see that document and `ARCHITECTURE_RULES.md` for rationale.

**Convention:** every item is phrased so the required answer is **No**, unless marked **(must be YES)**. A "Yes" on an unmarked item is a violation: block the PR, or require an ADR amendment if the author believes the rule itself is wrong. Don't silently wave it through as "just this once" — that is precisely the pattern that produced the current fragmentation.

If a PR touches multiple subsystems, run every relevant section separately for each.

---

## Dependency Rules

- [ ] Does this PR add an import that points **upward** (e.g., Platform importing from Vault Ingest, Vault Ingest importing from the application layer, application layer importing from `features/`)?
- [ ] Does this PR make a `features/` or `app/` file import a concrete class from `application/`, `vault/`, or `platform/` instead of receiving it via props/context?
- [ ] Does this PR add a dependency from `Workspace` to anything other than nothing (Workspace must remain dependency-free)?
- [ ] Does this PR make `NavigationRouter` depend on the Persistence Gate directly (instead of going through `PageOperations`/`FolderOperations`)?
- [ ] Does this PR make Sync depend on the application layer (`PageOperations`/`FolderOperations`) rather than only on Platform, Vault Ingest, and Vault?
- [ ] Does this PR introduce a new cross-subsystem import that isn't reflected in the dependency diagram in `docs/architecture-target.md`?

## Ownership Rules

- [ ] Does this PR introduce a second implementation of a capability that `PageOperations` or `FolderOperations` already owns (create, save, archive, restore, delete, move, rename)?
- [ ] Does this PR add a new top-level `application/` file for a capability that belongs on an existing aggregate's facade, instead of adding a method to that facade?
- [ ] Does this PR let two different files claim responsibility for the same business rule (e.g., a second place that decides draft-promotion, archive-path computation, or collision-free naming)?
- [ ] Does this PR add a new projection/index to `Vault` that duplicates data already derivable from an existing projection?
- [ ] If this PR introduces a genuinely new aggregate (e.g., Templates, Attachments), does its facade **not** follow the established `open/create/mutate/delete` shape used by `PageOperations`/`FolderOperations`?

## Persistence Rules

- [ ] Does this PR call `VaultFileSystem.writeFile`, `.deleteFile`, or `.moveFile` from anywhere other than the Persistence Gate, Sync's internal write helper, or Platform's own implementation?
- [ ] Does this PR create a new write path for page or folder content that does not enqueue through `PagePersistenceCoordinator`?
- [ ] Does this PR mutate `Vault` (`addPage`/`replacePage`/`removePage`/`updatePagePath`/`moveFolder`) from any file outside the Persistence Gate or Sync?
- [ ] Does this PR add a new `PersistenceOperation` kind whose handler skips the per-page queue (e.g., writes synchronously outside `enqueue`)?
- [ ] Does this PR introduce a "temporary" or "bootstrap-only" bypass of the Gate that isn't the one documented, reviewed exception in the Composition Root's two-phase construction?
- [ ] Does this PR let a path-changing operation (move/archive/restore) call `fileSystem.moveFile` directly instead of going through `MoveService`?

## Application Layer Rules

- [ ] Does this PR add a method to `PageOperations`/`FolderOperations`/`NavigationRouter` whose entire body is an unconditional forward to another method (a pure pass-through facade)?
- [ ] Does this PR put a business rule (validation, lifecycle decision, side-effecting policy) inside the Persistence Gate, Vault Ingest, or the UI instead of inside a capability facade?
- [ ] Does this PR add a capability-lifecycle method to `NavigationRouter` (create/save/archive/restore/delete/move/rename-shaped) instead of to `PageOperations`/`FolderOperations`?
- [ ] Does this PR call `VaultFileSystem` or `Vault` mutation methods directly from `PageOperations`/`FolderOperations` instead of going through the Persistence Gate?
- [ ] Does this PR leave a stub method (`throw new Error('not implemented')`) wired to a live UI entry point (keyboard shortcut, button, menu item) that a user can actually trigger?
- [ ] Does this PR duplicate `DocumentSession`/`DocumentRegistry`/`SaveCoordinator` logic instead of reusing the existing editing collaborators?

## UI Rules

- [ ] Does this PR construct a service or query object inside a component body (e.g., `new VaultQuery(vault)`, `new Application(...)`) instead of receiving it as a prop?
- [ ] Does this PR import a concrete class from `application/`, `vault/`, or `platform/` into a file under `features/`, `app/`, or `components/`?
- [ ] Does this PR wire a UI element (button, menu item, shortcut) to a handler that is a no-op, or that has no handler at all, while presenting as if it works (not visibly disabled)?
- [ ] Does this PR add a new component that renders with required props left undefined at its call site?
- [ ] Does this PR duplicate an existing presentational pattern (e.g., another near-identical top-bar-actions or page-model component) instead of extracting or reusing the shared shape?
- [ ] Does this PR let a feature component call into `NavigationRouter`/`PageOperations`/`FolderOperations` other than via the callback-prop pattern already established?

## Domain Rules

- [ ] Does this PR add filesystem I/O, path-string parsing (`split('/')`, `lastIndexOf('/')`, etc.), or any OS-specific logic inside `vault/model/`?
- [ ] Does this PR make `Vault` aware of *how* something is persisted (write ordering, queueing, retry) rather than only *what* currently exists?
- [ ] Does this PR add a new live (always-rebuilt) projection without a real, already-shipped UI consumer?
- [ ] Does this PR add a new lazy projection that isn't invalidated on every relevant mutation?
- [ ] Does this PR allow a page or folder to exist in two different, inconsistent states across `pagesById`/`pagesByPath` (or the folder equivalents) even momentarily in a way another reader could observe?
- [ ] Does this PR add path-manipulation logic anywhere outside `vault/path/` or `platform/`?

## Composition Root Rules

- [ ] Does this PR construct an `application/`, `vault/`, or `platform/` concrete class from anywhere other than `Application.ts` (the Composition Root)?
- [ ] Does this PR add a second instance of a subsystem that should be a singleton for the app's session (e.g., a second `PagePersistenceCoordinator`, a second `Vault`)?
- [ ] Does this PR add conditional business logic (an `if` that decides *what* the app does, not just *in what order* things are constructed) inside `Application.ts`?
- [ ] Does this PR construct the same collaborator object more than once for the same long-lived purpose (duplicate `FrontmatterParser`, `FrontmatterSerializer`, `PageRebuilder`, etc.) outside the one documented bootstrap/runtime split?
- [ ] Does this PR import `LocalFileSystem`/`LocalFileSystemWatcher` (or any other concrete Platform implementation) from anywhere other than the Composition Root?

## Testing Rules

- [ ] **(must be YES)** If this PR adds or changes a `PersistenceOperation` kind, does it include a concurrency test proving two operations on the same page id serialize correctly?
- [ ] **(must be YES)** If this PR adds a new capability method on `PageOperations`/`FolderOperations`, does it have a test covering both the success path and at least one validation-failure path?
- [ ] **(must be YES)** If this PR adds a new `Vault` mutation path, does it include a test asserting `pagesById`/`pagesByPath` (or folder equivalents) remain consistent afterward?
- [ ] Does this PR test a UI component against a real `Application`/service instance instead of a facade-shaped test double?
- [ ] Does this PR add a new extractor, builder, or projection without a unit test isolated from the full pipeline?
- [ ] **(must be YES)** If this PR changes the Composition Root's construction sequence, does a test assert every subsystem is still constructed exactly once?

## Migration Rules

- [ ] Does this PR add a new capability using the pattern the migration is actively removing (a new standalone `*Service.ts` file bypassing the Gate) rather than the target pattern (a facade method backed by the Gate)?
- [ ] Does this PR touch a subsystem the migration plan marks "leave alone" (e.g., `core/engine`/`DocumentEditing` internals, the knowledge-graph builders' internal logic) for a reason other than the specific phase that calls for it?
- [ ] Does this PR reintroduce anything already deleted as dead (orphaned `packages/` code, the confirmed-dead files, the unused `overlay` barrel) under a new name?
- [ ] Does this PR mark something "temporary" or "TODO: fix later" without an issue/ADR reference and a phase it belongs to?
- [ ] Does this PR complete a migration-plan phase only partially, in a way that leaves the codebase with *both* the old and new pattern live for the same capability with no tracking issue for finishing the migration?
- [ ] Does this PR change `docs/architecture-specification.md` to match what the code does, instead of changing the code to match the spec — without an accompanying ADR explaining why the spec itself was wrong?

---

**If every applicable box above is unchecked (or every "(must be YES)" item is checked): approve.**
**If any box is checked: either the PR changes to comply, or the reviewer requires a new/amended ADR in `docs/adr/` before merge.** A checked box is never resolved by a comment saying it's fine — the specification is the source of truth until it is formally amended.
