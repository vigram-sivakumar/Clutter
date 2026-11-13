# ADR-073 Phase 0 evidence

Recorded 2026-11-13 against `81f4ff8` on `spike/adr-073-phase0`, plus the uncommitted editor-history, ADR and test changes described here.

**Overall: the three application/editor history blockers are fixed and pass as ordinary regression tests. Multi-window exposure is still NOT READY: G1–G3 and native-window validation remain unverified.** This is a history-safety implementation and validation checkpoint, not a completed multiple-window feature or successful Phase 0. No dependency declarations or native capabilities changed.

## Scope and ownership

This is post-migration feature validation under ADR-073 Phase 0. The added integration test exercises the existing Composition Root (`Application.attachVault`), PageOperations (`commitEdit`, `requestSave`, `open`, `rename`), Persistence Gate, Sync (`reconcileKnownPath`), Workspace/Navigation Router, DocumentSession and UI/Features editor boundary (`createEditorView`, `syncMarkdownIntoView`, `captureEditorHistory`). Production changes stay in the editor feature layer and keep the existing public core APIs and owners. CodeMirror remains the sole history owner. Page mutations still enter through PageOperations and the existing Gate; incoming disk updates use Sync. Native watchers, recovery, Trash, coordination-store spike and DocumentEditing internals are untouched.

The new harness constructs two or three real Applications and CodeMirror EditorViews over a shared simulated filesystem, with distinct Vaults, registries, navigation, histories, self-write registries and persistence adapters. A session subscription bridges incoming content into the editor, as the React host normally does. Explicit `reconcileKnownPath` substitutes for watcher delivery. The initial session fingerprint is seeded from the exact fixture bytes, matching ingestion/open semantics; otherwise a stale-save test would omit the real guard. The navigation test exercises the actual Navigation Router, but does not mount React's full page-switch lifecycle. The cache test exercises the real history capture/restore boundary, not a native-window close/reopen.

**Limits:** same JavaScript realm, jsdom, no real layout, no native watchers/IPC, no actual WKWebViews, no security-scoped filesystem, no crash/power-loss proof. The in-memory atomic writer is a semantic double, not proof of native atomicity or simultaneous-writer linearizability. In particular this harness does not validate cross-realm editor-cache isolation, preference notifications or settings write contention.

## Application/editor results

Test: `apps/app/src/features/markdown/editor/codemirror/createEditorView.multiWindow.test.ts`.

| Scenario | Result |
|---|---|
| Independent active note, back/forward navigation, cursor/selection and DocumentSessions | Passed |
| Saved edit reaches a clean peer; receiving session stays clean and gains no undo entry | Passed |
| Alternating edits, undo and redo in both windows preserve the other window's unrelated edit | Passed |
| Incoming insertion maps the peer's selected range | Passed |
| Pending redo survives an unrelated incoming edit | Passed |
| Dirty peer keeps unsaved work; stale save does not overwrite newer disk content | Passed |
| Three Applications converge with separate undo depths | Passed |
| Note rename follows stable identity without navigating the peer | Passed |
| Undo after multi-hunk peer changes surrounding a prior local replacement | Passed after fix |
| Undo after a peer replaces the same range | Passed after fix |
| Restore cached editor history after an unrelated disk update while away from the note | Passed after fix |

### Original reproductions and causes (before the fix)

Start with `first\nmiddle\nlast` in A and B.

1. **Multi-hunk update.** A changes `middle` to `MIDDLE`, saves, B reconciles. B changes `first` to `FIRST` and `last` to `LAST`, saves, A reconciles. Undo in A should produce `FIRST\nmiddle\nLAST`. It previously produced `FIRST\nMIDDLE\nLASTmiddle`.
2. **Overlapping replacement.** A changes `middle` to `MIDDLE`, saves, B reconciles. B replaces `MIDDLE` with `peer`, saves, A reconciles. Undo in A previously produced `first\npeermiddle\nlast`. An obsolete inverse must instead be unavailable under the proposed conservative v1 contract; it must never reinsert text at an unrelated mapped position.
3. **Cached history.** Capture A's editor history after its saved prefix edit. B appends unrelated text and saves. Construct the editor again with the new document and A's cached history, as at the existing cache restoration boundary. Undo was unavailable; A's otherwise unrelated history was dropped.

`createEditorView.ts` previously computed one common-prefix/common-suffix replacement for external sync. For a multi-hunk update that replacement spans unchanged local text too. `addToHistory: false` prevents a remote change becoming a local undo step, but does not guarantee that previously stored inverse changes map safely through that replacement. Even a genuinely single-hunk overlapping replacement can remap an inverse insertion into obsolete text. Separately, the previous cached-history restore intentionally rejected a snapshot when its stored document differs from the new document, losing all that snapshot's undo/redo. These are different problems; adopting a multi-hunk diff alone would not resolve overlapping history or stale cache restoration.

### Implemented resolution

- `externalTextChanges.ts` computes multiple character-level changes with a bounded Myers diff in UTF-16 coordinates. Prefix/suffix trimming and search limits bound the work for large/wholesale changes. Exhaustive short-string tests compare reconstruction and minimum edit cost against an independent dynamic-programming oracle; additional tests cover repeated text, Unicode, CRLF, sparse edits in long notes, and both budget limits.
- `externalEditorSync.ts` is the single transaction builder used by live sync and cached restoration. Incoming changes are excluded from local history and edit callbacks, with history grouping isolated on both sides.
- A CodeMirror StateField stores only local conflict coordinates, not text or inverse operations. An overlapping incoming edit clears both undo and redo for that note in the receiving window using public Compartment reconfiguration. The remove/reinstall transactions reach the view in one update. This can discard unrelated older entries in that note, and conservatively includes coordinates of undone/trimmed edits until reset. Other notes/windows are unaffected. No private CodeMirror history representation is read or modified.
- If diff search exceeds edit distance 512 or 1,000,000 search steps, the exact incoming content is applied with a conservative replacement and the affected note's history is cleared. This favors safety over keeping history for a wholesale or exceptionally large ambiguous update.
- Cached history is initialized against its original text and advanced through the same external-sync transactions before mounting the view. Snapshot objects stay immutable. Metadata effects are retained for a real subsequent undo, never replayed during reconciliation. Legacy snapshots without conflict coordinates restore only against identical text and use a conservative full-document footprint for later sync.
- Pixel scroll and the existing automatic-focus policy retain their exact-text guard. This change does not attempt to map old pixel offsets or implement cross-window navigation/history sharing.

### Current test commands and interpretation

From the repository root:

```bash
npm ci --ignore-scripts
npm test --workspace=apps/app -- --run src/features/markdown/editor/codemirror/createEditorView.multiWindow.test.ts
```

**All 11 integration acceptance tests pass normally.** The prior `it.fails` annotations and strict-mode environment switch were removed; there are no expected failures hiding the original blockers. At the initial checkpoint the strict run reported 8 passed / 3 failed; those same assertions now pass.

The final focused run covered 24 files: new integration, diff and sync suites, existing editor foundation/refused-edit/metadata-history suites, all Sync suites, NavigationRouter, Application workspace restoration and atomic workspace-state tests. **395 passed; no expected failures or skips.** The diff suite includes 14,641 source/target pairs inside its exhaustive test.

A broader run covered the full markdown editor directory, Sync and the selected navigation/settings suites: **5,793 passed / 11 failed across 237 files (5,804 tests)**. Baseline comparison and isolated rerun results are recorded below; this broad run is not reported as green.

Baseline comparison used a clean detached checkout of the same commit with its own dependencies. Seven failures reproduce there: `listMarkerWidth` (canvas text measurement), `listSettings` (computed CSS values), `embedLivePreview.pdf` (two fit-width cases), and `pdfResizeHandle` (three layout cases). Three additional UI failures were fixture-isolation issues exposed by keeping cached selections across changed text: the note/PDF menu suites reused the same page id across different tests, and the image-position case mounted two unrelated fixtures with the same id. Those fixtures now explicitly clear the per-note cache, as the existing MarkdownEditor suite already did between tests. The affected menu/image suites and the date suite pass together on rerun (**130 tests**). A new real React mount/unmount/remount test proves that genuine same-note history is still retained and undo/redo reaches the real DocumentSession after an unrelated update while unmounted (**11 session-sync tests passed**). The original date timeout passed on rerun; it is not attributed to the history change.

The final broad rerun after the fixture fixes used `--maxWorkers=4 --testTimeout=10000`: **5,799 passed / 7 failed across 237 files (5,806 tests)**. The seven failure names exactly match the clean baseline; there are no additional failures. The higher timeout avoids conflating the earlier loaded-run date-completion timeout with a behavior regression. No baseline failures were skipped or disabled.

A real Chromium check using the production editor foundation and actual keyboard events passed: multi-hunk update → undo → redo, overlapping update → unavailable undo, then fresh typing → undo. No page errors. This verifies browser DOM/keymap behavior, not macOS native menu routing or WKWebView behavior.

`npx tsc --noEmit -p apps/app/tsconfig.json`: passed. `git diff --check`: passed.

## Coordination/native evidence inventory

The next coordination pass is recorded in [COORDINATION-CHECKPOINT.md](./COORDINATION-CHECKPOINT.md). The initial history checkpoint found bodies only in E1/E2; E3–E9 were placeholders. The current pass extracts the shared pure evaluator, adds portable checks and implements native subsets for E3–E7/E9. E8 and E10–E12 remain pending. Native subsets are compiler-checked for macOS, not runtime-validated here. The runner reports incomplete gates explicitly; neither a portable green run nor a compiled native subset is a passed G1–G3 gate.

The production native layer still has a single watcher slot, `main`-only command authorization and filesystem capabilities, and menu/zoom routing assumptions. A second production window cannot simply be added to a menu. The test-only native foundation remains pending; it must scope watchers, menu events, readiness and permissions correctly before its results mean anything.

**Cache scoping:** the subsequent [tabs foundation checkpoint](../../docs/tabs-foundation.md) scopes cached editor sessions by Application identity and page id, including permanent-deletion cleanup. A real editor unmount/remount regression covers copied note IDs and identical text across Applications. This does not implement simultaneous-pane view identity or native window routing.

## Native acceptance matrix still required

After completing the remaining coordination validation and building the isolated test-only native foundation, repeat the tests with two and three actual windows in development, packaged and sandboxed macOS builds. Record build identity and results for each environment, not one combined checkmark:

- Additional window creation without a fixed count cap; independent active Space/note/folder, back/forward, per-note undo/redo, cursor, selection and scrolling. Verify cached history on real note switches and use the actual focused-window keyboard/menu undo path.
- Create, edit, rename, move, archive, restore and delete notes/folders/assets; viewing a deleted or moved parent/subtree; sidebar/collection refresh without navigation. Keep unrelated windows' navigation intact and protect dirty affected sessions.
- Same-note alternating and concurrent dirty edits, overlapping and separated edits, undo/redo after remote changes and after navigation, save failures and native conditional-write conflicts. Do not accept silent overwrite or the original broken G4 output above.
- Add/remove/rename/relocate Spaces with peers on the same and different Spaces, removal of the last Space, hung/dirty peers, permission denial, stale commands and fallback chains (ADR E4–E11).
- Shared app/Space preferences, simultaneous settings writes from separate webviews, exhausted conditional-write retries, hidden-window/focus reconciliation, dropped notifications and watcher scoping.
- Manual close versus Quit, cancel during quit, last-window close, crash/relaunch, frame/session restoration and exclusion of live recovery sessions.

Do not expose File → New Window or declare Phase 0 complete until the required gates and native build matrix pass. This checkpoint contains no commit or push.


## Recovery component checkpoint before tabs

Production recovery IO is now exercised directly through the spike's `recovery_files`
module on Linux (13 tests). Journal tests cover live-peer filtering via an injected
lookup, failed lookups, optional backward-compatible metadata and protection races.
`recovery_list()` has no registry dependency. These are component checks, not a passed
E8 gate: native window registration/liveness, real transitions and downgrade binary
acceptance remain pending. See [tabs-foundation.md](../../docs/tabs-foundation.md).
