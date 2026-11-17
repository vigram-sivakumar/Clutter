# Current rebuild changelog

Dated experimental implementation history is archived in Git. This is the concise
current ledger; revisions below are delivery identifiers, not document file versions.

## 54 — 2026-11-17

- Implement final P-40: current-tab normal navigation, per-pane Back/Forward,
  note-menu new-tab and in-active-tab split actions; each tab retains its layout.
- Retain independent view/context identities and local selection/scroll/history;
  same-note views reconcile through one Core. No global selected-note routing.
- Checkpoint bounded, versioned per-window ID/layout metadata through an injected UI
  port; opaque private runtime mechanism, no duplicate document bodies or semantics.
  Persist visited references and register new identities before editing; guard close
  across hidden contexts, pending creation and layout writes. Recover after restart.
- 102 Linux integration tests, strict Core/runtime TS and41-source boundaries pass.
  No dependency/native pins or Core/editor source changes. Mac54 observation pending.
- User53 note-switching PASS retained. From stage3 onward, discuss UX before each
  stage, ask one question at a time and record answers. No stage3 implementation yet.

## Clarification after53 — 2026-11-17

- User PASS: new entry switches between notes. Close/reopen and multi-window results
  are not inferred.
- Latest P-40: each window has tabs, each tab has a split layout of note views.
  Ordinary opening navigates the current tab/active pane with Back/Forward history.
  Menu actions explicitly open a new tab or a split within the active tab. Different
  and same notes are supported. Earlier pane-owned tabs/global focus-existing-tab
  default proposals are superseded, not implemented or passed.

## 53 — 2026-11-17

- User broadened explicit teardown to full and compact Markdown, vault/persistence
  and all connected code. Remove the complete old product and incompatible consumers,
  automation, old demo entry, duplicate draft controller and obsolete docs/proof hosts.
- Move selected qualified mechanisms once into Core/editor/desktop-runtime; new React
  UI and single Tauri product composition use actual page catalogue/create/edit flows.
- Protect every retained page and unknown create outcome; stable bounded context IDs
  distinguish space/window/page/pane. Fresh Structured development locator, no migration.
- Prune dependency graph873→137 entries, preserve exact native lock export bytes.
- Current source checks and native limitations are in NATIVE-TEST-PROGRESS.md and scoped
  evidence. No automatic commit/push/main change or old real-user data deletion.

## Relevant preceding facts

52 checked in exact verified user-exported native locks and removed active reliance
on old experiment projects/cache.109 Linux runtime tests and strict TS passed at that
scope.51 recorded clean rebuild plan/main static reference. Prior user composition
passes covered shared edits, view remount, text history, native close and same-Space
reopen. Caret displacement was intermittent/unreproduced; user asked to move on.
No old source/test is preserved merely to keep its previous count green.
