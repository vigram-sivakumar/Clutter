# Resume Clutter Structured

## Current checkpoint — clean product boot53, 2026-11-17

User applied52 and authorized proceeding, then explicitly included BOTH full and
compact Markdown implementations, old vault/persistence and everything connected in
the teardown. Clean/stable architecture takes precedence over saving old code/docs.
No existing users/data require migration. Main stays untouched.

53 replaces the actual product source graph. apps/desktop is the single Tauri entry;
packages/core, editor, ui and desktop-runtime own real moved/reworked implementations.
React renders sidebar/header/page controls; PM owns contenteditable DOM. Core page.list
queries current accepted heads with bounded keyset pagination. UI creates real pages,
opens/edits/saves, retains contexts across page navigation, supports split contexts and
protects inactive-page drafts on close. Unknown create replies retry the exact request
and block unsafe close. Context IDs hash space/window/page/pane to bounded stable IDs.

Removed: entire apps/app (including CM6/full+compact Markdown and its domain/vault/
persistence/native pipeline), old app automation, Foundation demo workspaces and
entry, duplicate draft-only controller, executable research/proof hosts, stale launch
configuration and obsolete old architecture docs. Useful media/stdio test fixtures now
live under packages/desktop-runtime/test/fixtures. Git history holds retired material.
Current root lock has137 workspace/dependency entries (previous873), no CM6/Lezer or
Markdown parser. Native exported lock bytes remain exact; crate identity is retained
only to avoid gratuitous dependency-lock changes, not as another product entry.

Source acceptance:93/93 Linux integration tests, strict TS and38-source boundary
checks pass; exact native locks unchanged and npm locked install plan validates. See evidence/clean-product-53-2026-11-17/review.json and current
verification ledger. Linux integration/type/boundary/lock validation does not infer a
Mac build/native pass. Separate Chromium pilot could not start under the execution
host's socket restrictions; no real-browser/native measurement claimed from it.
Previous user native composition passes remain historical; caret displacement remains
intermittent/unreproduced and user asked to move on. No new Mac caret fix claimed.

NEXT user action: apply/commit53 in Clutter Structured, npm ci --ignore-scripts,
npm run desktop. This builds a fresh synthetic Structured Space under Git metadata
clutter-structured53, leaving old proof locators/stores untouched. No new profiling or
old suite replay. Once the new window opens: create two pages, type distinct text,
switch between them, save/close, then npm run desktop:reopen and confirm pages/text.
Guide only a necessary failure/reproduction, one concrete step at a time.

Then R2: title editing, full editor schema and actual component/NodeView renderer
adapters for agreed text/blocks/tables/tasks/media. Do not restore legacy widgets or
compact Markdown to fill missing screens. R3 completes remaining product flows.
Installed data-bearing storage/identity/security/durability/final-format, Windows/web
compositions, scale and release/distribution stay explicit future milestones.

## Worktrees and authority

- /Users/sivakuv3/Documents/Personal/projects/Clutter Structured:
  architecture/clutter-foundation, active rebuild.
- /Users/sivakuv3/Documents/Personal/projects/Clutter Markdown:
  main, existing application. Same repository; separate checked-out files/builds.

No source is migrated from main. Its read-only5c532f8 snapshot was only a visual/
behavior reference. No automatic commit/push/merge/main switch. Root AGENTS.md,
ARCHITECTURE_RULES.md, docs/architecture.md and confirmed product contracts replace old
frozen class/API governance. Current checkpoint overrides dated historical next steps.
