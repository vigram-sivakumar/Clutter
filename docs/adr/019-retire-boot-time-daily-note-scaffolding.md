# ADR-019: Retire `ensureDirectoryForToday` — Composition Root no longer scaffolds Daily Notes at boot

**Status:** Accepted

## Context

[ADR-017](./017-draft-page-lifecycle.md) §9 retained `ensureDirectoryForToday()` as a disclosed, temporary exception to "navigation never creates durable knowledge," blocked specifically on `Vault` having no live `addFolder` mutation — folders could only enter `Vault` via the startup scan, so if the month directory wasn't real before that scan ran, no `Folder` for it could ever exist for the rest of that session. ADR-017 named the follow-up explicitly: "designing runtime folder registration... would let month-directory creation move to first-save time too... It should be scoped and designed on its own terms — with its own ADR."

That gap has since closed by ordinary extension of already-accepted architecture, not new architecture: `FolderOperations.create()` (ADR-012's open backlog item, delivered during the Create Folder milestone) gives `Vault` a live, mid-session way to gain a `Folder`. `DailyNoteService.ensureFolderChain()` (commit `14d72008`) uses it to materialize the year/month chain at persist time, and `PageOperations.persistDraft()` (commit `cda08c7b`) calls it before every Daily Note's Gate `create` write — fixing the exact bug ADR-017 anticipated in passing ("a Daily Note for any month other than the one `ensureDirectoryForToday` scaffolded... failed to persist"). `ensureDirectoryForToday()` has run alongside this replacement, unused by the resulting write path, since that fix landed.

With the blocking precondition gone, ADR-017 §9's exception has no remaining justification: the boot-time directory write was accepted only "for as long as that limitation exists," and it no longer does.

Separately, `Application.open()`'s hardcoded "resolve or draft today's note" behavior is the last piece of Daily-Notes-specific logic inside the Composition Root. The eventual product direction (Vigram, 2026-08-02) is a future choice between Open Today's Note / Restore Last Session / Open Empty Workspace. `open()` is the correct long-term owner of that decision — its own Invariants already carve out exactly one allowed branch ("does the vault already have today's note, real page or draft... a resolve-or-draft ordering question, not a product rule") — but it should stop depending on a `todayNotePath` field `bootstrap()` precomputed as a side effect of scaffolding a directory, so a later `open(strategy)` extension doesn't first have to unwind that dependency.

## Decision

1. `DailyNoteService.ensureDirectoryForToday()` and its private helper `ensureDirectory(date, rootPath)` are removed. `DailyNoteService` keeps `ensureFolderChain()` — the persist-time mechanism — as its only folder-materialization responsibility. `DailyNoteService` no longer needs a `VaultFileSystem` at all (its remaining method takes `vault`/`folderOperations` as call-time parameters, per its existing doc comment); the constructor is reduced to zero arguments.
2. `Application.bootstrap()` no longer calls `ensureDirectoryForToday()` and no longer stores a `todayNotePath` field. It performs no Daily-Notes-specific work at all.
3. `Application.open()` keeps deciding what opens at boot, computing today's deterministic path itself at call time (`DailyNotePath.absoluteFrom(this.vault.root, new Date())`) rather than reading a bootstrap-time field — the same resolve-or-draft call `Sidebar`'s "Start your day…" already performs through `PageOperations.openAtPath`. Behavior is unchanged: the real page if the scan found one, otherwise an unpersisted draft, exactly as today.
4. No startup-strategy parameter is introduced by this ADR. This is scoped narrowly to removing dead scaffolding and its dependency; the future `open(strategy: StartupStrategy)` extension remains a separate, later decision.

## Alternatives Considered

- **Move the "open today's note" decision into `AppShell`.** Rejected — `AppShell`/UI is spec'd to dispatch to facades, not decide (spec §12). Moving it there now would mean moving it again into a strategy dispatcher later, the exact churn this ADR avoids by keeping the decision in the Composition Root, which already owns this one documented branch.
- **Introduce the `open(strategy)` parameter now, defaulted to today's exact behavior.** Rejected as premature — no second strategy is implemented yet, and adding an unused parameter (or a single-member union) is exactly the "unconsumed machinery" `implementation-rules.md` §2.13 warns against. The method is being shaped so it *resists* that future change less, not pre-built to accommodate it.
- **Leave `ensureDirectoryForToday()` in place as inert, unused scaffolding.** Rejected — it would be dead code with an already-superseded justification (ADR-017 §9's own "not accepted as a permanent design choice" framing), and its continued presence would misleadingly suggest the boot-time exception is still load-bearing.

## Consequences

- `docs/architecture-specification.md` §11 (Composition Root) is amended to match: the public API surface stays `bootstrap`/`attachVault`/`open`/`close` unchanged, but the Lifecycle prose and the Startup sequence's `ensureDirectoryForToday` step and `todayNotePath` references are removed/updated — per `implementation-rules.md` §4's divergence process, spec updated after this ADR, not silently.
- `DailyNoteService`'s constructor signature changes (drops `VaultFileSystem`); every construction call site (`Application.bootstrap()` and existing tests) updates to the zero-argument form.
- ADR-017 §9's disclosed exception is now fully closed; no boot-time directory write remains anywhere in the Daily Notes path. Folder materialization has exactly one mechanism (`ensureFolderChain`, persist-time) and one caller (`PageOperations.persistDraft`).
- `Application.open()`'s public shape (no parameters, decides internally) is unchanged from today's signature — this ADR is a dependency removal and an internal computation change, not a public API change requiring further spec amendment beyond the Lifecycle prose.

## Why This Approach Is Preferred

It closes exactly the exception ADR-017 §9 disclosed and scoped, using only architecture already accepted (`FolderOperations.create()`, ADR-012) — no new subsystem, no new Gate operation kind, no new `Vault` mutation method. It keeps "what opens at boot" where the spec already permits it to live (the Composition Root's one allowed conditional branch), so the eventual startup-strategy work is a parameter addition to an existing method, not a second relocation of logic that would otherwise sit in `AppShell` first and move again later.
