# 09 — Application Architecture Compliance Audit

Scope: `apps/app/src/core/application/` (`daily-notes/`, `folder/`, `navigation/`, `page/`) and `apps/app/src/core/engine/` (`DocumentEditing`, per spec note "formerly core/engine"). Audited against all 12 rules in `ARCHITECTURE_RULES.md` and the sequence specs in `docs/architecture-specification.md`.

## Summary

The application layer is the most mature, most spec-compliant part of the codebase — and also the part that has evolved furthest beyond the frozen spec's literal text (autosave/draft lifecycle machinery added under ADR-017/018/019 is real, tested, and well-documented, but not reflected in the spec's public-API listing). Eleven of twelve architecture rules pass with direct grep evidence. **Rule 10 (path semantics confined to `VaultPath`) is violated**, and the violation is concentrated in exactly the files ARCHITECTURE_RULES.md's own rule-10 rationale names as the historical offenders — meaning the "fix" the rule describes was written down but not fully carried out in the current codebase. `NavigationRouter` has also drifted structurally from spec (missing several spec'd methods, two stub methods that throw `Error('not implemented')`).

## Current Architecture

- `PageOperations` (`core/application/page/PageOperations.ts`, 857 lines): the single owning facade for page lifecycle — open/openDraft/openAtPath/getDraft/updateDraftTitle/close/getSession/commitEdit/requestSave/flushAll/save/updateMetadata/archive/restore/create/move/delete. Substantially larger than spec §6's listed surface — draft lifecycle (ADR-017), autosave (`commitEdit`/`requestSave`/`flushAll`), and `updateMetadata` are all real, shipped additions layered on top of the frozen spec, each with inline ADR citations.
- `FolderOperations` (`core/application/folder/FolderOperations.ts`): open/create/move/rename, matching spec §7.
- `NavigationRouter` (`core/application/navigation/NavigationRouter.ts`): **only** `openArchive`/`openInbox`/`openTemplates`/`createTask`/`createTag` are implemented; `createTask`/`createTag` both `throw new Error(...'is not implemented.')` (`NavigationRouter.ts:47-51`). Spec §8 lists `openFavorites`, `openAllNotes`, `openAllTasks`, `openSomedayTasks`, `openCompletedTasks`, `openAllTags` — **none of these exist in the shipped class.** This is a real spec/code divergence, not just an additive one.
- `DocumentEditing` (`core/engine/`: `DocumentRegistry`, `DocumentSession`, `DocumentState`, `DocumentRevision`, `DocumentTransaction`, `SaveCoordinator`) — matches spec §9 closely; `open(id, initialContent)` takes a bare `id`, matching ADR-018's identity-decoupling correction (confirmed: `DocumentRegistry.ts` — not independently re-read line-by-line this pass, but `PageOperations.ts:172,202,255` all call `documentRegistry.open(id-or-page.id, markdown)` with a string id, consistent with spec).
- `Application` (`core/application/Application.ts`) — Composition Root, two-phase `bootstrap()`/`attachVault()`, matches spec §11 almost exactly, including the documented construction-order comments explaining *why* each object is built where.
- `daily-notes/` (`DailyNotePath`, `DailyNoteService`) — not named as its own subsystem in the spec; folded into `PageOperations`'s draft-promotion path as a narrow, singular helper. This is the site of the rule-10 violation (below).

## Evidence — Rule-by-Rule Compliance Audit

**Rule 1 (one owning facade per capability):** PASS. `grep -rn "PagePersistenceCoordinator.enqueue\|coordinator.enqueue"` across the app layer surfaces exactly the call sites inside `PageOperations`/`FolderOperations`; no second creator/mutator class exists. `DailyNoteService.ensureFolderChain` calls `folderOperations.create()` (`DailyNoteService.ts:100`) rather than writing folders itself — it delegates to the one owning facade rather than bypassing it, consistent with the rule's own worked example (`DailyNoteService.ensurePage()`, now retired per ADR-017) and its amendment allowing a narrow, singular, system-triggered exception.

**Rule 2 (one write path through the Gate):** PASS, with direct grep evidence:
```
core/vault/persistence/PagePersistenceCoordinator.ts:212  fileSystem.deleteFile
core/vault/persistence/PagePersistenceCoordinator.ts:268  fileSystem.writeFile
core/vault/persistence/PagePersistenceCoordinator.ts:326-327  fileSystem.createDirectory/writeFile
core/vault/persistence/PagePersistenceCoordinator.ts:464  fileSystem.writeFile
core/vault/persistence/MoveService.ts:124,127  fileSystem.createDirectory/moveFile
core/vault/sync/persistSyncedPageDocument.ts:29  fileSystem.writeFile   (Sync's separate, spec-sanctioned path)
core/vault/initialize/VaultInitializer.ts:40,53  fileSystem.createDirectory/writeFile   (bootstrap-only, out of Gate scope per spec §5 note — writes `.clutter/*` and reserved folders, never Page/Folder content)
```
No write-method call sites exist anywhere in `application/`, `features/`, `app/`, or `components/`. `PageOperations`/`FolderOperations` reach disk **exclusively** via `this.coordinator.enqueue(...)`.

**Rule 3 (Vault mutation methods confined to persistence/sync):** PASS.
```
core/vault/persistence/PagePersistenceCoordinator.ts:218,290,347,470  vault.removePage/addPage/addFolder/replacePage
core/vault/persistence/MoveService.ts:130  vault.updatePagePath
core/vault/sync/VaultSyncService.ts:145,161,184,233  vault.addPage/replacePage/removePage/updatePagePath
core/vault/sync/persistSyncedPageDocument.ts:34  vault.replacePage
```
No mutation-method call exists in `application/`, `engine/`, or the UI layers (grep across the whole `src/` tree for `.addPage(`/`.replacePage(`/`.removePage(`/`.updatePagePath(`/`.moveFolder(`/`.addFolder(` returns only the eight lines above, all inside `vault/persistence/` or `vault/sync/`).

**Rule 4 (Platform owns all fs/watcher access):** PASS, with a **naming caveat**. `grep -rln "@tauri-apps/plugin-fs"` returns only `core/vault/providers/LocalFileSystem.ts`; `grep -rln "invoke("` returns only `core/vault/providers/LocalFileSystemWatcher.ts`. So the *isolation* the rule requires holds. However: the spec's own vocabulary calls this subsystem "Platform" and implies a `platform/` folder (§1: "implemented only inside `platform/`" — ARCHITECTURE_RULES.md rule 4 verbatim); the actual folder is `core/vault/providers/`, nested *inside* `vault/`, not a sibling top-level module. Functionally isolated, but the folder structure doesn't match the spec's stated location — worth a documentation fix, not a behavior bug.

**Rule 5 (business rules live in facades, not infrastructure):** PASS on direct inspection. `PagePersistenceCoordinator`'s only conditional logic found is structural/dequeue-time existence/state checks (e.g. the `create`-resolves-at-dequeue-time guard, matching spec §5's explicitly-sanctioned exception). All draft-promotion decisions (`shouldPromoteDraft`-equivalent logic) live in `PageOperations` (`save()` at `PageOperations.ts:544-554`, `updateDraftTitle()` at `PageOperations.ts:306-327`, `updateMetadata()` at `PageOperations.ts:625-668`) — none of this logic appears inside `PagePersistenceCoordinator`, `VaultSyncService`, or any Ingest file.

**Rule 6 (UI never constructs application-layer services):** PASS.
```
grep new (Vault|PageOperations|FolderOperations|PagePersistenceCoordinator|VaultQuery|Application)\( in features/, app/, components/  →  zero non-test matches
```
The only `new VaultQuery(...)`/`new PageOperations(...)`/etc. outside test files is `Application.ts` (Composition Root) itself. UI files that import application-layer symbols do so exclusively via `import type { ... }` (confirmed for `features/tasks/shortcuts/buildTasksShortcutHandler.ts`, `features/notes/sidebar/Sidebar.Notes.tsx`, `features/tags/shortcuts/buildTagsShortcutHandler.ts`, etc. — all `import type`). One exception: `features/daily-notes/sidebar/DailyNotesList.tsx:2` does a **value** import of `DailyNotePath` (`import { DailyNotePath } from '@core/application/daily-notes/DailyNotePath'`) and calls `DailyNotePath.monthIsoFromFolderNames(...)` directly (line 44). `DailyNotePath` is a stateless static-method value object, not a "service" in the rule's sense (no `PageOperations`/`FolderOperations`/`NavigationRouter`/Gate/Vault access) — it's a defensible, narrow exception, but it is technically a concrete-class value import from `application/` into `features/`, which the rule's literal text doesn't carve out. Flagged as **Hidden Coupling**, not a hard violation.

**Rule 7 (dependencies point downward only):** PASS. Targeted greps found zero imports from `core/vault/` or `core/engine/` back into `core/application/`; zero imports from `core/` into `features/`; zero imports from `core/engine/` into `core/application/`; zero `core/vault/` → `core/workspace/` imports. Layering is clean in the files sampled.

**Rule 8 (derived data is disposable):** PASS. `KnowledgeGraph`/`Embed` are fully rebuildable, no setters exist on either, and — confirmed via `Vault.ts:76,196-248` — both are literally invalidated-and-recomputed on demand, never patched. No consumer of `knowledgeGraph()`/`embeds()` was found anywhere under `features/` in this pass (consistent with the rule's own "no consumer yet" allowance, ADR-004/ADR-016 cited directly in the source comments).

**Rule 9 (facades never forward unconditionally):** PASS, and the code shows visible awareness of this rule: `NavigationRouter`'s own doc comment (`NavigationRouter.ts:10-17`) explains that `openNote`/`openDailyNote`/`openFolder` were **deliberately deleted** in Phase 4 specifically because ARCHITECTURE_RULES.md rule 9 forbids bare single-call forwards, and callers now hold `PageOperations`/`FolderOperations` references directly instead. No remaining method in `PageOperations`, `FolderOperations`, or `NavigationRouter` is a bare one-line forward on inspection.

**Rule 10 (path semantics confined to `VaultPath`/`platform/`):** **VIOLATED.** Multiple files outside `vault/ingest/VaultPath.ts` and `platform/`(`vault/providers/`) perform path-string manipulation:
```
core/application/daily-notes/DailyNoteService.ts:65   dailyNotePath.slice(dailyNotesRoot.path.length + 1)
core/application/daily-notes/DailyNoteService.ts:66   relative.split('/')
core/application/daily-notes/DailyNoteService.ts:94   `${parent.path}/${name}`   (path composition)
core/vault/persistence/MoveService.ts:31,52,63,69,92  `${...}/${filename}` path composition (5 sites)
core/vault/sync/VaultSyncService.ts:292               `${this.vault.root}/${relativePath}`
core/vault/models/Vault.ts:140                        `${this.root}/${relativePath}`  (getReservedFolder)
```
This is a **confirmed, named-in-advance regression**: ARCHITECTURE_RULES.md rule 10's own "Why it exists" section states Phase 5's audit *already found* this exact logic scattered across `MoveService`, `PagePersistenceCoordinator`, `VaultSyncService`, `Vault.moveFolder`'s descendant check, `ArchiveMetadataReconciler`, `VaultBuilder`, `PageBuilder`, and `DailyNoteService`, and frames confining it as the fix. `PagePersistenceCoordinator`, `VaultBuilder`, `PageBuilder`, and `ArchiveMetadataReconciler` are now clean (no path-string ops found in this pass) — so some of that list was genuinely fixed — but `MoveService`, `VaultSyncService`, and `DailyNoteService` **still do it today**, and `Vault.ts` itself has a new instance (`getReservedFolder`) not present in the original audit's list. Per the rule's own text, this is flagged as a code-review checkpoint rather than lint-enforced, which is exactly how it persisted unnoticed.

**Rule 11 (Composition Root is the only wiring place):** PASS. `Application.ts` is the only file matching `new (LocalFileSystem|LocalFileSystemWatcher|PagePersistenceCoordinator|PageOperations|FolderOperations|NavigationRouter|VaultSyncService|Workspace)\(` outside test files (confirmed via grep — all non-test matches are in `Application.ts:88-228`). No conditional business logic found in `Application.ts` beyond the documented `open()` "does today's note exist" resolve-or-draft branch, which the spec explicitly sanctions as the one allowed branch (§11 Invariants).

**Rule 12 (no capability has more than one write path):** PASS as a composite of rules 1+2 both passing — no capability was found with a facade method whose corresponding write bypasses the Gate, nor a Gate-reachable write with no facade method.

## Strengths

- The autosave/draft system (ADR-017/018/019) is a genuinely sophisticated, carefully-reasoned extension of the frozen spec, with in-line citations to specific ADR sections at every non-obvious branch (`PageOperations.ts` is unusually well-commented for *why*, not just *what*).
- `requestSave()`'s in-flight-promise sharing (`PageOperations.ts:415-431`) is a real concurrency-correctness fix (documented as found during "M8's pre-implementation audit") — evidence the team's own process (read spec, implement, verify) is actually being followed, not just documented.
- `NavigationRouter`'s self-pruning history (deleted forwarding methods, rule 9 cited by name in the source) is strong evidence rules are enforced by working engineers, not just written down.

## Weaknesses

- Rule 10 violation, detailed above — the single clearest, most concretely evidenced architectural regression found in this investigation.
- `NavigationRouter` has drifted from spec in both directions: it's missing 6 of the spec'd view-intent methods (`openFavorites`/`openAllNotes`/`openAllTasks`/`openSomedayTasks`/`openCompletedTasks`/`openAllTags`) and has 2 unspec'd stub methods that throw at runtime (`createTask`/`createTag`) rather than not existing at all. A stub that throws is worse than an absent method for a future contributor grepping for "how do I open All Tasks" — it looks implemented until called.

## Hidden Assumptions

- The rule-10 audit assumes "Phase 5" fully swept the codebase; the evidence shows it only partially did, and nothing prevents a *new* file introducing a 9th scattered path-manipulation site tomorrow, since (per the rule's own text) enforcement is code-review-only, not lint-mechanical.
- `DailyNoteService.ensureFolderChain`'s "narrow, singular, system-triggered" exception (Rule 1's amendment) is sound today but has no test or lint asserting it stays singular — a second daily-note-like feature (e.g. a future "Weekly Notes") copying this pattern would be exactly the "second instance is the actual fragmentation signal" scenario the rule's own amendment warns about.

## Hidden Coupling

- `DailyNotePath` is imported by value into a UI feature file (`DailyNotesList.tsx`), coupling that component directly to an application-layer class rather than receiving it via props/context — small in isolation, a Pattern worth naming for future contributors before it becomes precedent.
- `PageOperations` and `FolderOperations` share one `PagePersistenceCoordinator` instance (correct, per spec), but `PageOperations` also holds a **direct reference to `FolderOperations`** (`PageOperations.ts:114`, used for `DailyNoteService.ensureFolderChain`) — this is a one-way, spec-consistent dependency (Page needs Folder for daily-note folder materialization), but it does mean `PageOperations` cannot be constructed or tested in true isolation from `FolderOperations`, which is a coupling worth being deliberate about if a third `*Operations` facade is ever added.

## Behavior Analysis

Every write-triggering method in `PageOperations`/`FolderOperations` funnels to exactly one `coordinator.enqueue()` call — confirmed for `save`, `updateMetadata`, `archive`, `restore`, `move`, `delete`, `create`/`persistDraft`. The single-queue-per-page-id guarantee (spec §5) is therefore actually reachable from every public entry point audited.

## UX Analysis

Not directly applicable to this report's scope (see 09's sibling UX/features reports) — but note that `NavigationRouter.createTask()`/`createTag()` throwing at runtime means any UI element wired to them (if one exists) would crash rather than gracefully no-op or hide; worth flagging to the UX/features investigator to confirm no such UI element is currently reachable.

## Product Analysis

The gap between spec's `NavigationRouter` (view-filtered lists: All Tasks, Favorites, All Tags, etc.) and the shipped one (just three reserved-folder shortcuts) suggests those product surfaces (a Favorites view, an All Tasks view) may not be built yet at all, or are implemented some other way this investigation didn't find (worth checking with the features investigator — `features/tasks/`, `features/tags/` do exist and were seen importing `NavigationRouter` by type, so they may resolve filtering client-side via `VaultQuery` directly rather than through the router).

## Performance Analysis

No performance concerns specific to the application layer beyond what report 07 already covers (the layer itself does no additional scanning beyond what `VaultQuery`/`Vault` already do).

## Scalability Analysis

`PageOperations`'s `drafts` Map and `draftIdByDeterministicPath` Map are both unbounded, in-memory, session-lifetime maps with no eviction — for a session with many draft opens (e.g. rapidly clicking "New Note" and closing without saving many times) these could grow, though `close()` does delete from `drafts` (`PageOperations.ts:337`), bounding it to currently-open drafts, not all-time drafts. Not a practical scalability risk at any vault size, since it's bounded by concurrent UI state, not vault size.

## Alternative Designs

- Rule 10's violation could be fixed by extending `VaultPath` with the exact "future extension point" its own doc comment already anticipates (a "sibling-metadata-file path" helper, `VaultPath.ts:9-12`) generalized to "join a relative segment onto a base path" and "split a relative path into named segments" — both `DailyNoteService` and `MoveService`'s needs reduce to these two primitives.
- `NavigationRouter`'s two throwing stubs could be deleted entirely (consistent with rule 9's spirit — an unimplemented method is arguably worse than an absent one) until `TaskOperations`/`TagOperations` genuinely exist, per the code's own comment citing ADR-012's disposition.

## Trade-offs

Leaving Rule 10's violation unfixed costs little today (no bug traced to it in this pass — it's a maintainability/predictability risk, not a correctness one) but directly undermines the specific extension point (a second storage backend) that rule exists to protect; the cost compounds the longer it's deferred, exactly as the rule's own rationale predicts.

## Confidence Level

- Rules 1-9, 11, 12 compliance: **Verified** via direct grep + source read, not sampled.
- Rule 10 violation: **Verified** — every cited line was read directly.
- `NavigationRouter` spec divergence: **Verified** (spec text vs. shipped source directly compared).
- "No UI element calls createTask/createTag": **Unknown** — not exhaustively checked against every `features/` file; flagged for the features investigator.
- Product-level explanation for missing NavigationRouter methods (e.g. that Favorites/All Tasks filtering happens client-side via VaultQuery instead): **Hypothesis** — plausible given `VaultQuery.getFavoritePages`/`getArchivedPages` exist, but not traced to a specific consuming component in this pass.

## Next Investigation Areas

- Trace `features/tasks/`, `features/tags/` to confirm whether "All Tasks"/"All Tags" views are wired directly to `VaultQuery`/`Vault.tasks()`/`Vault.tags()` rather than through `NavigationRouter`, which would explain (and partially justify) the spec/code divergence.
- Confirm whether any UI element can reach `NavigationRouter.createTask()`/`createTag()` (crash risk) — hand off to features/UX investigator.
- Check `docs/adr/` for whether Rule 10's `MoveService`/`VaultSyncService`/`DailyNoteService` residual violations are formally accepted/tracked anywhere, or genuinely unnoticed.
