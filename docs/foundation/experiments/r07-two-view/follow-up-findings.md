# R07 second slice: selection and origin-aware history

Date: 2026-11-14. This follows the preserved [first findings](findings.md).
No production code or upstream package source changed. Neither candidate is an
accepted Clutter architecture; no cloud service/collaboration feature was added.

## Selection: fix the command boundary, retain the control

R07-PM-PUBLIC-02 adds `selection-preflight.mjs`. At keydown, it checks the focused
editor's native text range and maps it with public `EditorView.posAtDOM` and
`TextSelection` APIs before key commands use model selection. The transaction only
changes view selection, creates no content revision/history group, and never calls
focus, a private DOM observer, or a timer. It skips composition/handled events,
unfocused surfaces, node/cell selections and nested read-only controls.

The original immediate last-cell click → End → Tab now creates one row and types
in the expected cell in the adapted two-view candidate and adapted minimal control.
The raw minimal control still reproduces the old mismatch in the recorded run.
The test has no added settle waits. Empty cells, Shift-Tab, backward native ranges,
focus ownership and exclusion guards are regression probes. The composition-flag
probe is synthetic branch evidence, not an actual IME test. All model-selection
modes/platforms and races are not thereby qualified.

The default `/` view uses this explicit experimental adapter. `/?selection=raw`
disables it. `/control` is raw; `/control?selection=public` differs only by the
adapter. Library code is unpatched. Keep both routes when comparing runtimes.

## History: compare ownership semantics, do not rewrite history metadata

The original PM history/raw batched-insert diagnostic is unchanged and still
reproduces deletion of the foreign contribution. Its conservative guard still
refuses that inverse. Changing step grouping or rewriting private history metadata
would not establish correct undo/redo semantics, so neither is used as a fix.

R07-PM-ORIGIN-02 is a separate local-only representation/history experiment using
pinned Yjs 13.6.33 and y-prosemirror 1.3.7. One accepted local Y.Doc is owned by the
candidate authority. Each editor has a provisional replica and origin-scoped undo
manager. Authoritative deliveries use an untracked origin. Staged candidate updates
reuse schema/task-identity validation; invalid local updates retain recovery bytes
without changing accepted state. There is no network/cloud provider in this route.

In the tested batched case, undo now produces `FOREIGNAlpha beta`; redo restores
`abFOREIGNcdAlpha beta`, and B's own undo can still remove only B's insertion.
Separate probes cover granular typing, disjoint foreign formatting, overlapping
redo, Unicode, backward selection, explicit grouping, table edits and paused
same-position updates. These are actual browser-binding checks, not just a plain
Y.Text demo or a change from refusal to a weaker assertion.

This candidate does not reuse PM's history plugin or the conservative guard. It
has no persistence, production command/outcome API, CLI/MCP bridge or origin-history
recovery across host/view destruction yet. It must not replace the fuller first
candidate by hiding missing capabilities. Full structural/attribute conflict undo,
unknown-schema preservation and task/page lifecycle need further qualification.
No provider whole-document latest-wins policy changes: future remote snapshots
would require their own protected generation/history boundary under Q-07.

## Evidence and limits

The second-slice report records exact source/dependency hashes, commands and results.
Browser results distinguish candidate checks from raw-control failures; an expected
raw failure is reported as a failure and is not counted as a candidate acceptance
pass. Node tests include the original unsafe-history diagnostic as a reproduction,
not a product acceptance success. Both first-slice evidence and expectations remain
available unchanged. No delay/retry was inserted into the qualifying input steps.

No macOS/WKWebView, native IME/VoiceOver/menu, real paste MIME, Windows/provider,
performance/large-document or production security proof is available here. Next,
carry these controls into packaged macOS and expand semantic history/lifecycle plus
headless/shared-API parity before architecture selection. If the selection adapter
or origin candidate fails native input or architectural requirements, revise or
reject it; the present implementation imposes no constraint.

## Primary/version evidence

- [Published y-prosemirror 1.3.7 source commit](https://github.com/yjs/y-prosemirror/tree/f89fadd2a8bf15c0c7e6bfcac268883a5fa4e0f8)
- [Yjs UndoManager documentation](https://github.com/yjs/yjs#undomanager)
- Public selection APIs were checked in the pinned prosemirror-view 1.42.9 and
  prosemirror-state 1.4.4 published type declarations/source. No package patch.

The upstream main README may describe a newer `@y/prosemirror` API. This experiment
uses the pinned `y-prosemirror` package's actual exports/source, not that newer API.
