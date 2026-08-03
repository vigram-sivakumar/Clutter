# Clutter Architecture Rules

These are the rules that define Clutter's architecture and should still be true after years of development, regardless of which features exist. They are derived from `docs/architecture-specification.md` and are enforced, not aspirational — every rule below states its enforcement mechanism and what counts as a regression against it. Day-to-day compliance is checked via `docs/architecture-compliance-checklist.md`; the ADRs in `docs/adr/` record why each rule was chosen over the alternatives.

If a rule and a deadline conflict, the deadline yields, or the rule is formally amended via a new ADR. It is never silently bypassed "for now."

---

## 1. Every capability has exactly one owning facade

**Rule:** Every user-facing capability on an aggregate (create, save, archive, restore, delete, move, rename, and future additions) is implemented in exactly one place: `PageOperations` for pages, `FolderOperations` for folders, or a single new `*Operations` facade for any future aggregate — never split across multiple services.

**Why it exists:** The independent assessment found the opposite of this rule in the pre-migration codebase — six files (`PageApplicationService`, `PageMutationService`, `ResourceCreation`, `ResourceDeletionService`, `MoveService`, half of `NavigationService`) each owned a slice of "what can happen to a page," with no single file a new contributor could read to understand the whole lifecycle. That fragmentation, not any individual file, was the primary source of unpredictable change cost.

**How it is enforced:** Compliance checklist, "Ownership Rules" section, at every PR. No automated check can fully catch "this should have been a method on an existing facade" — this is a review judgment call, backed by the rule that a new standalone `application/*Service.ts` file requires the reviewer to confirm it's a genuinely new aggregate, not a new verb on an existing one.

**Regression signature:** A second file that can create, delete, or otherwise mutate a page/folder outside `PageOperations`/`FolderOperations`. A `NavigationRouter` method whose body reimplements logic already present in a facade instead of calling it.

**Distinct workflows sharing a mechanism vs. a second owner of the same decision (see ADR-014's amendment):** This rule governs *decisions* — a capability has one owner if there is one place that decides *whether and how* a given kind of mutation happens for arbitrary, general-purpose callers. It does not prohibit a narrow, singular, system-triggered workflow from enqueuing directly through the Gate when that workflow is making a genuinely different decision than the one a facade method already owns — provided the write still lands through the one Gate (rule 2 is never relaxed) and the exception doesn't proliferate. `DailyNoteService.ensurePage()` was the canonical example of this — it decided "does today's one specific, well-known page exist yet," a singular, bootstrap-triggered, fixed-target check, distinct from `PageOperations.create()`'s general-purpose, repeatable decision. ADR-017 retired it: today's note is no longer created eagerly at all, so there is no longer any code exercising this exception anywhere in the codebase (confirmed — no `PagePersistenceCoordinator.enqueue` call site exists outside `PageOperations`/`FolderOperations`). The rule's substance is unchanged and remains available for a future case matching the same shape; it currently has no live instance to point to.

**Regression signature (amendment):** A *second general-purpose* creator/mutator of the same aggregate — i.e., a second file any ordinary, arbitrary, user-triggered caller could reach for "create a page" — is the violation this rule forbids. A single, narrow, system-triggered, fixed-target workflow enqueuing directly through the Gate is not this violation, *as long as it stays singular*: if a second such bypass ever appears anywhere else, that second instance is the actual fragmentation signal to act on — generalize the relevant facade method at that point, not before.

---

## 2. Every page or folder write flows through the Persistence Gate

**Rule:** `PagePersistenceCoordinator` (the Persistence Gate) is the only code path that calls `VaultFileSystem.writeFile`/`.deleteFile`/`.moveFile` for page or folder content, and the only code path that mutates `Vault` in response to an app-initiated action. Sync has its own, separate path for externally-triggered reconciliation, sharing the Gate's internal write-parse-rebuild-replace helper but not its queue.

**Scope:** the Gate governs Vault domain content only — `Page`/`Folder` objects and their durable metadata, the things `Vault.addPage`/`replacePage`/`removePage`/`updatePagePath`/`moveFolder` model. It does not govern Clutter-owned application infrastructure or configuration — caches, indexes, plugin state, `.clutter/*` files, or any other implementation artifact that never becomes a `Page`/`Folder` in the Vault domain model. Direct writes to those (e.g. `VaultInitializer` writing `.clutter/workspace.json`) are not Gate bypasses, because they were never Gate-governed to begin with.

**Why it exists:** The assessment found three independently-implemented write paths (the queued coordinator for edit/archive, and two unqueued direct-write paths for create and delete) with no shared serialization between them — a real, if not-yet-triggered, data race. A single gate is what makes "no two writes to the same page can race" a provable property instead of a hope.

**How it is enforced:** Compliance checklist, "Persistence Rules" section. Ideally backed by an ESLint import-boundary rule restricting `VaultFileSystem` write-method call sites to `vault/persistence/` and `vault/sync/` — this project has used ESLint architectural-boundary enforcement before (per its own git history) and should again.

**Regression signature:** Any new file calling `fileSystem.writeFile`/`deleteFile`/`moveFile` directly. Any "bootstrap-only" or "just this once" direct write introduced without being the one documented Composition Root exception.

---

## 3. Vault is the sole authoritative in-memory domain model

**Rule:** `Vault` is the only object that answers "what pages and folders currently exist, and what do we know about them." It performs zero filesystem I/O, and its mutation methods (`addPage`/`replacePage`/`removePage`/`updatePagePath`/`moveFolder`) are called only by the Persistence Gate and Sync.

**Why it exists:** A domain model that can be mutated from multiple, uncoordinated call sites cannot guarantee internal consistency (its own id/path index maps drifting out of sync with each other). Restricting mutation to two callers, both of which already serialize their own operations, is what makes `Vault`'s own invariants (no duplicate ids, consistent id/path maps) provable rather than incidental.

**How it is enforced:** Compliance checklist, "Domain Rules" and "Ownership Rules." An import-boundary lint rule restricting imports of `Vault`'s mutation methods to `vault/persistence/` and `vault/sync/` is the target mechanical enforcement.

**Regression signature:** Any file outside those two folders calling `vault.addPage`/`replacePage`/`removePage`/`updatePagePath`/`moveFolder` directly. `Vault` gaining a dependency on `VaultFileSystem` or any I/O-capable object.

---

## 4. Platform owns all OS-level filesystem and watcher interaction

**Rule:** Every read, write, directory listing, and change-notification touching the real filesystem happens behind the `VaultFileSystem`/`VaultFileSystemWatcher` interfaces, implemented only inside `platform/`. No other subsystem imports a Tauri fs API or Rust command invocation directly.

**Why it exists:** This boundary already existed and already worked in the pre-migration codebase — the assessment found it to be the cleanest-scoped part of the whole system. The rule exists to make sure it stays that way as the app grows, and to keep a future second storage backend (cloud, git-backed) a Composition Root-only change rather than a grep-and-hope migration.

**How it is enforced:** Compliance checklist, "Composition Root Rules" and "Dependency Rules." Code review should treat any `import ... from '@tauri-apps/plugin-fs'` or `invoke(...)` call outside `platform/` as an automatic block.

**Regression signature:** A feature or application-layer file importing a Tauri plugin directly "just for this one read." A second, ad hoc file-watching mechanism introduced alongside the existing one.

---

## 5. Business rules live inside capability facades, not their infrastructure

**Rule:** Decisions about *whether* something should happen (draft promotion, validation, side-effecting policy) live inside `PageOperations`/`FolderOperations` (or a future aggregate's facade). The Persistence Gate, Vault Ingest, and Platform only ever decide *how* to carry out an operation that's already been decided.

**Why it exists:** `shouldPromoteDraft` is the one piece of business logic the assessment found to be correctly placed — small, pure, colocated with the operation it modifies. The rule generalizes that one good example into a standing principle, specifically to prevent a "rules engine" or "policy layer" from being invented later as a separate subsystem, which would just be the same fragmentation problem in a new location.

**How it is enforced:** Compliance checklist, "Application Layer Rules." Reviewer judgment: if a PR adds a decision (an `if` that changes product behavior, not just control flow) inside the Gate, Ingest, or Platform, that's a placement violation regardless of how small the change is.

**Business policy vs. structural/concurrency validation (see ADR-011's amendment):** This rule governs *business policy* — decisions that depend on product rules, permissions, or judgment calls about what should be allowed (draft promotion is the canonical example), which never go stale between enqueue and dequeue and so are always safe to evaluate synchronously in the facade. It does not prohibit *structural precondition checks* that depend only on the Vault's current state and exist solely to keep a queued operation from executing incorrectly against a page that changed underneath it — e.g., "this page is already archived," "this path is already occupied," "this id already exists." Those checks are only correct if evaluated inside the Gate's serialized per-page queue, at the moment the operation actually runs: a facade evaluating the same check synchronously before enqueueing would be reading a snapshot that can go stale before its own queued operation executes, silently defeating the guard. A structural check never decides *whether the product should allow this*; it decides *whether this already-decided operation is still valid to execute safely*, which is part of *how* the Gate carries out a write — the same category as `MoveService`'s occupied-path check or `Vault.addPage`'s duplicate-id check, neither of which is a rule-5 violation today.

**Regression signature:** A *business policy* decision — draft promotion, permissions, feature gating, or any decision that varies by product rule rather than by the Vault's own state — appearing inside `PagePersistenceCoordinator`, `VaultSyncService`, or any Ingest file. A structural precondition check evaluated at dequeue time inside the Gate is not this violation; a facade re-implementing that same check earlier, synchronously, in a way that can go stale before its enqueued operation runs, is a *correctness* bug even though it looks like "proper" rule-5 placement.

---

## 6. UI never constructs application-layer services

**Rule:** Components under `app/`, `features/`, and `components/` receive `PageOperations`, `FolderOperations`, `NavigationRouter`, and query objects (`VaultQuery`) as props/context from the Composition Root's wiring, never by constructing or importing a concrete class themselves.

**Why it exists:** The assessment found three components independently constructing `new VaultQuery(vault)` rather than receiving one — a small thing individually, but the same instinct at the application-service level (a component reaching for `new Application(...)` or importing `PagePersistenceCoordinator` directly) is exactly how a UI-orchestrates-business-logic pattern would creep in, which the product's own stated goals explicitly reject.

**How it is enforced:** Compliance checklist, "UI Rules." An ESLint boundary rule restricting imports of `application/`, `vault/`, and `platform/` concrete exports from `features/`/`app/`/`components/` is the target mechanical check.

**Regression signature:** Any `new` expression instantiating an application-layer or vault-layer class inside a React component body. Any direct import of a concrete service class (as opposed to its type, for prop typing) into a feature file.

---

## 7. Dependencies point downward only

**Rule:** The layering is Platform → Vault Ingest → Vault Domain Model / Persistence Gate / Sync → Application Layer (`PageOperations`/`FolderOperations`/`NavigationRouter`) → UI/Features. `Workspace` sits parallel to the Vault stack, depended on by the application layer and UI, depending on nothing. No file imports from a layer above its own.

**Why it exists:** This is the single mechanical property that makes "how much of the codebase do I need to understand to change X" a bounded question instead of an open-ended one. It's also what makes the storage-backend-swap and richer-editor extension points real rather than theoretical — both assume nothing above Platform (or above `DocumentEditing`, respectively) needs to change.

**How it is enforced:** An ESLint architectural-boundary configuration (the project has precedent for this exact mechanism) mapping each folder to its allowed import sources, checked in CI on every PR, not just at review time. Compliance checklist, "Dependency Rules" section as the manual backstop until that lint config exists.

**Regression signature:** Any import statement whose source folder is architecturally "above" the importing file per the diagram in `docs/architecture-target.md`.

---

## 8. Derived data is disposable

**Rule:** Every projection over `Vault`'s page/folder data — tags, tasks, the knowledge graph, embeds, aliases, and any future ones — must be fully reconstructable from the source pages at any time, with no projection ever being the only place a fact is recorded. Live projections rebuild on every relevant mutation; lazy projections rebuild on next access after invalidation. Neither kind is ever partially/incrementally patched in a way that could drift from source truth.

**Why it exists:** This is what allows the assessment's "no consumer yet" finding about the knowledge graph/embeds/aliases to be a non-issue rather than a liability — because they're fully disposable, leaving them unused and un-deleted costs nothing but CPU (and the lazy-evaluation change in the target architecture removes even that). It also means a bug in a projection's builder is a data-loss risk of zero — worst case, delete the cache and rebuild.

**How it is enforced:** Compliance checklist, "Domain Rules" — specifically, no PR may introduce a code path where a projection is the only place a value is written. Test coverage: rebuilding a projection from scratch must always equal its currently-cached value for the same source data.

**Regression signature:** Any projection gaining a setter or mutation method that isn't purely derived from a rebuild. Any feature reading a projection as if it could contain information not present in the underlying pages.

---

## 9. Facades never forward unconditionally

**Rule:** A method on any facade (`PageOperations`, `FolderOperations`, `NavigationRouter`) whose entire implementation is a single unconditional call to another method must not exist. If a caller needs the underlying method, it calls it directly (or holds a reference to the object that owns it).

**Why it exists:** This is a direct correction of `NavigationService.openNote`/`.openDailyNote`, which were byte-identical one-line forwards to `PageApplicationService.openPage` — a facade method that adds a name but no behavior is a tax on every future reader trying to find where logic actually lives, with no offsetting benefit.

**How it is enforced:** Compliance checklist, "Application Layer Rules." Reviewable by inspection — a method body that is a single `return this.x.y(...args)` with no added logic, validation, or side effect is the exact pattern to reject.

**Regression signature:** Any newly-added facade method whose body is a single pass-through call.

---

## 10. Path semantics are confined to one place outside Platform

**Rule:** No file outside `platform/` and a single designated `vault/ingest/VaultPath.ts` helper performs path-string manipulation (splitting on `/`, computing parent directories, checking prefixes for folder membership, etc.). `VaultPath` is a pure value object: it knows only how to interpret a path string — never the filesystem, `Vault`, ids, `Page`/`Folder`, metadata, persistence, or any other business rule (see ADR-015).

**Why it exists:** Phase 5's audit found this logic actually scattered across `MoveService`, `PagePersistenceCoordinator`, `VaultSyncService`, `Vault.moveFolder`'s descendant-folder check, `ArchiveMetadataReconciler`, `VaultBuilder`, `PageBuilder`, and `DailyNoteService` — not `PagePathResolver`/`IdentityResolver` as originally assumed (neither does any path-string parsing; see ADR-015) — meaning a future storage backend with different path semantics (or none at all, e.g. a flat object-store-backed vault) would require auditing the entire codebase rather than one file. Confining it now, while there is still only one backend, is cheap; discovering it needs confining after a second backend is underway is not.

**How it is enforced:** Compliance checklist, "Domain Rules" — flagged as a code-review checkpoint specifically because it's not fully mechanically enforceable (string operations don't have a single lint-detectable shape the way an import does).

**Regression signature:** New code calling `.split('/')`, `.lastIndexOf('/')`, or equivalent path-string operations outside `vault/ingest/VaultPath.ts`/`platform/`.

---

## 11. The Composition Root is the only place concrete implementations are wired

**Rule:** `Application.ts` is the only file that imports concrete Platform implementations (`LocalFileSystem`, `LocalFileSystemWatcher`) and the only file that constructs long-lived instances of `PagePersistenceCoordinator`, `PageOperations`, `FolderOperations`, `NavigationRouter`, `VaultSyncService`, and `Workspace`. It contains no conditional business logic — only construction-order logic.

**Why it exists:** The pre-migration codebase had two independently-wired `ResourceCreation` instances and duplicate `FrontmatterParser`/`FrontmatterSerializer`/`PageRebuilder` construction, all inside the same file that was supposed to be the single source of wiring truth. Making the Composition Root's own internal discipline a named rule (not just an assumption) is what the two-phase `bootstrap()`/`attachVault()` split exists to satisfy.

**How it is enforced:** Compliance checklist, "Composition Root Rules." A test asserting every subsystem is constructed exactly once during `bootstrap()` + `attachVault()` (per the testing strategy in the specification) is the mechanical backstop.

**Regression signature:** A second construction of any subsystem meant to be a session-long singleton. Business logic (an `if` deciding product behavior, not construction order) appearing in `Application.ts`.

---

## 12. No capability may have more than one write path

**Rule:** This is the composite of rules 1 and 2, stated as its own check because it's the specific failure mode the assessment scored lowest: a capability is not "done" architecturally until it has exactly one implementation and exactly one path from "user intent" to "bytes on disk." A capability with a correct facade method but a bypassed Gate call (or vice versa) is still a violation.

**Why it exists:** This is the rule that most directly answers "will this still feel coherent after 300 more features" — each of those features either satisfies this rule immediately (new facade method, existing Gate) or it doesn't get merged. There is no accumulating middle state where "we'll unify the write paths later" persists across multiple releases, because rule 12 makes that middle state a checklist failure, not a backlog item.

**How it is enforced:** Compliance checklist, cross-referencing "Ownership Rules" and "Persistence Rules" together for every new capability.

**Regression signature:** Any capability where the facade method exists but a UI path still calls something else directly, or where a write happens without a corresponding facade method having been called.

---

## 13. Every page-list UI reads through `EffectivePageState`, not `VaultQuery`/`Vault` directly

**Rule:** Any UI that renders a list of pages (existence, folder membership, or presentation fields — title/label, description, body preview, icon) obtains that data through `EffectivePageState` (`core/application/page/EffectivePageState.ts`, [ADR-020](./docs/adr/020-effective-page-state-projection.md)), not by reading `Vault`/`VaultQuery` directly. `VaultQuery` remains the correct, sole source for folders (which have no draft concept) and for durable-only projections that have no Committed-stage counterpart by design (e.g. favorite/archived *membership* — a page must be persisted to be favorited or archived at all). A new page-list surface that bypasses `EffectivePageState` must state explicitly why in its PR — e.g., "this list is necessarily durable-only because X" — rather than defaulting to `VaultQuery` out of habit or unfamiliarity with the projection.

**Why it exists:** This is rule 12's read-side counterpart. `FolderTree` originally read pages through `VaultQuery` alone, which meant a newly-created draft (ADR-017) or a live, uncommitted edit to an untitled page's body never appeared in the sidebar until the next save — not a persistence bug, but a presentation-layer ownership gap: nothing reconciled Committed state (drafts, open `DocumentSession`s) with Durable state (`Vault`) for rendering purposes, so each consumer that needed both was left to invent its own merge. `EffectivePageState` was built specifically to be the one place that reconciliation happens (ADR-020), and `FolderTree`'s migration proved the pattern works end-to-end, including a subsequent refinement (ADR-020's M3 amendment) once a hybrid `VaultQuery` + `EffectivePageState` read model in the same component was found to still violate this rule's spirit. Without stating this as a standing rule, each new page-list surface (Daily Notes, the Collection/folder view, Favorites, and future ones — Search, Recent Notes, Tabs, Quick Switcher) risks independently reaching for `VaultQuery` the way `FolderTree` originally did, silently reintroducing the exact gap ADR-020 exists to close, one consumer at a time.

**How it is enforced:** Compliance checklist, "UI Rules." Code review should treat any new `query.getChildPages`/`getRootPages`/`vault.getPage` call inside a component that renders a list of pages as a violation unless justified per the exception clause above (as Favorites' membership check already is).

**Regression signature:** A new or modified page-list component importing `VaultQuery`/`Vault` to enumerate or label pages, when `EffectivePageState` already exposes an equivalent read. `DailyNotesList.tsx` and `toCollectionPageModel.ts` are known, tracked instances predating this rule — consumer migrations, not new violations — not yet brought into compliance as of this rule's addition.
