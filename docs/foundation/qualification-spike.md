# First qualification spike

Status: specification only. No prototype or production work is included in this change.
References: D-01, D-03 through D-09; T-01 through T-07, T-11 through T-13.

## Question

Can one coherent editor/domain/persistence system support dependable native
editing, two local views, headless app/CLI/MCP operations, historical restore and
multi-person convergence without competing document or history owners?

## Deliverables

A reproducible isolated harness, shared operation contract, fixtures, failure
injector, automated assertions and evidence report. Keep experiments outside
production wiring. Freeze candidate versions and preserve unpatched controls.
Start with Tiptap/PM versus CM6; do not grant either a pass based on earlier work.
Use one rich fixture: paragraphs, nested task/list, code, table, custom widget,
attachment, Unicode and stable IDs. It need not implement the whole product.

## Stage A: local vertical slice

1. Start the headless Space owner; attach two real views of one document, initially
   in two panes and then separate windows. Verify independent cursor/selection.
2. Edit from A, B, CLI and MCP. Test disjoint changes, stale replacement and repeated
   operation IDs. Both views and queries report the same accepted state/revision.
3. Exercise context-specific undo/redo, focus changes, close/reopen and tab switches.
   Test overlapping changes, not only disjoint appends.
4. Create a retained checkpoint, edit again, inspect/diff through all interfaces,
   restore with a precondition and verify new revision/provenance and assets.
5. Miss a notification, reconnect a client and reconcile. Race owner startup/takeover.
6. Fail persistence, close a view, terminate the owner and restart. Verify pending
   work, durability reports, command outcomes and retained versions.
7. Run actual WKWebView input/IME/native-menu contracts. Record Linux-only runs as
   preliminary. No production editor switch is approved without the native result.

## Stage B: collaboration feasibility

Use two independent durable replicas and two principals, rather than two views
sharing a heap. Partition/reconnect during overlapping text/structure edits.
Exercise selective undo, checkpoint/restore, replica restart and revoked access.
Evaluate at least the proposed merge model; rejected or unsupported operations
must preserve pending work. Stage A alone cannot qualify collaboration.

## Exit criteria

Report every relevant test as pass/fail/blocked with evidence. Explain canonical
representation, actor/context mapping, durability boundary, history authority,
asset reachability and process ownership. A comparison report identifies bugs,
configuration gaps and fundamental model failures separately. A dependency patch
requires an upstream/maintenance strategy and regression controls before adoption.

No claim of full crash safety, macOS reliability, multi-person support or production
readiness follows from building the harness. Unresolved core failures keep related
ADRs Proposed. Implementation may proceed only for independently qualified scope
with explicit dependency gates; unknown collaboration semantics cannot be deferred
past choosing the canonical document representation.
