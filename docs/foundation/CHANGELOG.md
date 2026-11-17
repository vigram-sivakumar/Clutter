# Current rebuild changelog

Dated experimental implementation history is archived in Git. This is the concise
current ledger; revisions below are delivery identifiers, not document file versions.

## 57 — 2026-11-17

- User56 reports flickering stopped; scoped manual visual PASS retained.
- Default duplicate split admission off; explicit allowDuplicateNoteInTab option
  enables it. Current displayed panes only; preserve normal navigation/history.
- Add new-window host port and actual Tauri window creation sharing one owner;
  per-window close nonces, guarded app quit and peer resume after refusal.
- Keep opaque child IDs privately addressable for developer same-session recovery.
- 114 Linux tests, strict Core/runtime TS and42-source boundaries pass. Native Rust
  compilation/new-window/quit awaits Mac; no Rust compiler here. No Core/editor/
  desktop-runtime source, schema or dependency/native-lock changes.
- Stage3 remains UX-first, one question at a time after navigation feedback.

## 56 — 2026-11-17

- Replace normal global busy/editability cycles with scoped operations and stable
  shell/pane hosts. Prepare actual PM surfaces before reveal across all routes.
- Add bounded recent surface retention, preserving context/history on eviction;
  retain source editability and user focus while splits prepare.
- Rebase queued structural changes; supersede obsolete same-pane work; guard focus,
  exact creation retry, registration and close across all outstanding preparation.
- 109 Linux tests, strict Core/runtime TS and42-source boundary checks pass. No
  Core/editor/runtime/native/dependency change; native visual result pending.
- Progress/handoff updated; stage3 still requires UX agreement before code.

## Follow-up to55 — analysis only, 2026-11-17

- User reports ordinary switching improved; New Page and split opening still flash.
- Trace common window-wide busy/disabled/editability coupling, incomplete surface
  readiness and pane/tab mount lifetimes. Record coherent lifecycle proposal and
  acceptance in rebuild/view-lifecycle-review.md; no implementation/pass claimed.

## 55 — 2026-11-17

- User54 navigation works; routine Preparing view flash is a reported defect.
- Keep the old editor visible until the registered destination context is ready;
  retain unaffected split DOM. Reuse scoped contexts/identity promises.
- Warm navigation does not wait for another metadata write; coalesce bookkeeping,
  checkpoint latest at Save/Close and preserve failure/recovery guards.
- 104 Linux tests, strict Core/runtime TS and41-source boundaries pass. Native55
  visual result pending; no Core/editor/runtime source or lock changes.
- Stage3 still waits for UX agreement, one question at a time.

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
