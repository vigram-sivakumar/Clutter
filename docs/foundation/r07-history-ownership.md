# Context-owned history and scoped undo guards

Revision 0.36, 2026-11-14. Isolated R07 implementation; no production architecture
accepted. The build 11 baseline and all earlier manual results remain preserved.

## Result against the unchanged contract

The same 30-case matched contract now passes its strict gate. No case assertion,
required-applied-inverse flag or case order was relaxed to obtain this result.

| Candidate    | Applied/passed fixture | Explicit protective refusal | Gap | Unexpected failure |
| ------------ | ---------------------- | --------------------------- | --- | ------------------ |
| Guarded step | 11                     | 4                           | 0   | 0                  |
| Origin-aware | 13                     | 2                           | 0   | 0                  |

The three formerly open cases now apply their required inverses: step HC-03
(disjoint formatting), origin HC-05 (disjoint edit after row addition), and origin
HC-06 (destroy/remount, undo, redo and tracking subsequent edits). Strict and
discovery runs agree and exit0. The six remaining refusals are the unchanged
profile's explicit protection of nested foreign text or structural foreign work;
they are not counted as applied undo. This is a bounded qualification result,
not complete semantic undo or a selected editor/storage/framework.

[Executed evidence](evidence/r07-28-2026-11-14.json) includes the unchanged contract
check, final source manifest, original implementation callback failure, new safety
checks and the retained unsafe raw controls. Earlier [baseline](r07-matched-comparison.md)
explains the three failures before this change.

## Ownership boundary

OriginAuthority lazily owns one [OriginHistoryContext](experiments/r07-two-view/src/origin-history-context.mjs)
per editing-context ID. That context owns the Y UndoManager and relative selection
bookmarks. Its bridge uses the published PM plugin key and public Y/PM operations;
it has no view-destruction manager hook and retains no EditorView, DOM node or
binding. Destroying a view stops the ordinary sync binding and leaves the context's
history observation alive. Only disposing the context/authority clears and
releases the manager. A/B remain independent editing histories.

The bridge records selections before owned edits and on history actions. It
restores valid text/backward, cell, node and all-document selections through
public relative-position/model-selection APIs, without writing binding internals
or flushing observers. Headless Node tests exercise undo/redo, subsequent edits,
selection restoration and explicit disposal without constructing an EditorView.
The original yUndoPlugin composition stays on the raw-control route, where the
view-remount redo failure still reproduces.

The destructive browser probe stores only model state, public props and the
mount container while a view is absent. It never keeps a destroyed EditorView.
Foreign accepted and paused provisional changes arriving while A is absent are
reconciled on remount; A's undo/redo still preserves B's work. This is local
same-session lifetime, not durable history across process restart.

## Guard boundaries

The step guard still replays accepted provenance plus pending owned steps. Known
foreign mark changes protect their mapped text spans; foreign attribute changes
protect their affected node. Unknown opaque changes protect the whole document.
An inverse deleting foreign text or touching protected overlapping formatting/
attributes is refused. Unrelated formatting/text no longer creates a global undo
lock. The replay also verifies the reconstructed document matches the context.

The Origin structural guard tags each append operation with its affected table
range and accepted revision. The authority retains only conservative before/after
change spans and origin metadata. It maps the table range through intervening
accepted changes and refuses when foreign work touches that table, including
formatting and deletion. Disjoint edits can move the table without blocking its
undo/redo. Opposite history entries receive the mapped scope after each action.
Repeated equal prefix/suffix runs are normalized into valid replacement maps;
malformed scopes fail closed. Revisions derive from the single change journal,
removing the redundant document-wide origin watermark/counter.

These guards remain conservative within overlapping scopes: the table guard is
not cell-granular semantic ownership, and mark/attribute scope is not last-writer
property ownership. They also retain/replay session history without production
compaction/performance qualification. Do not turn a passing bounded gate into
claims about every extension, large document, task lifecycle or provider conflict.

## Verification

- 84 Node checks pass; this includes one original raw-history diagnostic, not 84
  product acceptance tests. Seventeen new checks cover disjoint/overlapping marks,
  node attributes, mapped table scopes, context disposal and selection bookmarks.
- 30 matched cases: 24 applied/pass and 6 explicit refusals; strict exits 0 with no
  open cases in this contract. All 12 live desktop/CLI/MCP cases still pass.
- Seven added browser lifecycle cases pass: repeated A/B remounts, foreign edits
  while closed, paused owned edits while closed, both-axis guard undo/redo with
  outside/inside foreign changes, table formatting protection and cell-selection mode.
- The raw lifecycle control still loses redo (diagnostic gap). Existing raw PM
  history, raw Origin structural undo and raw selection failures remain recorded.
- Existing 21 selection, 11 origin, 66 table candidate browser passes, six native
  support checks and three Chromium capture-helper routes remain scoped regressions.
  No third-party version, dependency lock, Swift or production file changed.

The new bridge is Linux/Chromium and headless tested. Build 09's manual Mac passes
remain historical; no Mac 12 run is claimed. Batch a targeted native history/
selection smoke when the next integrated slice is ready, before final acceptance;
do not ask the user to repeat the entire completed session or repair verdict clicks.
IME remains unavailable and VoiceOver deferred at the user's request.

## Next: durable authority proof

Use the R04 [persistence contracts](vault-persistence-spec.md) and
[fault catalogue](persistence-contract-cases.json) to freeze a bounded durable-owner
experiment. State, accepted revision and operation outcome must commit together;
a dropped reply or process restart must resolve through the same outcome queried
from app/CLI/MCP. Test before/after commit and before acknowledgement, replay,
stale tokens, pending-input protection and corruption recovery. All interfaces
reach the same owner; none independently modifies note files.

Keep durable operation identity independent of a transport session: an old session
capability still fails closed, but after reconnect the current session must be
able to query the same durable space/operation outcome. Do not reuse the current
ephemeral cache/reset semantics as a crash-recovery implementation.

Choose an explicitly experimental backend/configuration for the proof, retaining
the P-SQL/P-ROOT/P-TEXT decision status. One canonical representation and explicit
projections are required; do not introduce two writable truths or put a live
SQLite file in an iCloud/Drive sync folder. Test the defined task/asset/history
closure needed for the decision. This is the next significant qualification piece,
followed by the architecture/ADR review; it is not a production rebuild approval.

## Delivery

Patch 12 is incremental over the exact bundle 11 target. It changes only foundation
code/tests/docs/evidence, with no agent commit/push or branch change. Existing
manual reports and baseline qualification artifacts are never rewritten.
