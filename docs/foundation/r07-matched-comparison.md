# Matched history and live-authority comparison

Revision 0.35, 2026-11-14. Automated R07 slice; no production architecture accepted.
The prior guided manual passes remain valid and are not being rerun or revoked.

## Result

Thirty matched candidate cases ran twice (discovery and strict qualification):

| Candidate    | Applied/passed fixture | Explicit refusal | Capability gap | Unexpected failure |
| ------------ | ---------------------- | ---------------- | -------------- | ------------------ |
| Guarded step | 10                     | 5                | 0              | 0                  |
| Origin-aware | 11                     | 3                | 1              | 0                  |

These totals describe different behaviours, not a ranking. Refusing a risky inverse
preserves data but does not demonstrate the same editing experience as applying
one. The default discovery command exits 0 when execution has no unexpected
failures; it does not mean qualification passed. Strict mode exits 1 for the three
open gates below. Both runs have the same classification. Existing raw controls
still reproduce unsafe history/selection behaviour and remain separate evidence.

| Case                                                                    | Guarded step                                 | Origin-aware                                                    | Implication                                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| HC-01 / HC-08: foreign text inside own insertion, from B or CLI         | Refuses inverse to protect foreign content   | Applies text undo while preserving foreign content              | Text-origin undo provides a more capable result for this fixture                    |
| HC-03: foreign formatting in another paragraph                          | Refuses because foreign opaque change exists | Applies inverse, preserves foreign formatting                   | Step provenance guard is overly broad for this disjoint case                        |
| HC-04 row/column: foreign text in newly created cells                   | Refuses                                      | Refuses                                                         | Both preserve content by blocking the unsafe structural inverse                     |
| HC-05: unrelated foreign text after adding an empty row                 | Applies inverse and retains foreign text     | Refuses because any foreign change crosses table guard boundary | Origin structural guard is overly broad for this disjoint case                      |
| HC-06: destroy/remount actual EditorView, then undo, redo and new edits | Preserves all three operations               | First undo can work, but redo and tracking new edits are lost   | Current Origin integration couples history observation to view destruction          |
| HC-07: delayed disjoint peer delivery                                   | Converges and undoes own change              | Same                                                            | Scoped delayed-delivery result, not provider proof                                  |
| CP-01–CP-06: shared command/transport boundary                          | All six pass                                 | All six pass                                                    | Real CLI/MCP processes reach the same live authority as the test desktop dispatcher |

## What the ownership proof actually implements

[Shared ingress](experiments/r07-two-view/src/live-command.mjs) owns one bounded
synthetic read/insert/outcome contract, session capability, request validation and
accepted receipt cache. CLI and MCP perform no document mutation or storage writes;
they call the same ingress through a loopback authenticated test relay. Desktop
commands invoke that same dispatcher directly; ordinary editor changes still
enter each candidate's single accepted authority through its existing context path.
Views observe accepted changes. The relay queues requests and stores no document.

The Node test driver uses Playwright to deliver relay requests into the selected
live browser authority. This proves ownership/interleaving under the harness;
it is **not** production desktop IPC, a standalone background vault service or a
server Clutter would require its users to maintain. Each candidate is tested
independently; no document is shared between the two candidate windows.

Origin's new external operation resolves a public Y relative text position and
submits through OriginAuthority validation/delivery. Node tests exercise it without
an EditorView or hidden DOM. This removes the earlier missing headless-command
adapter for this three-operation slice; it does not implement the 51 target API
sketches, stable-ID addressing, durable outcomes or production task semantics.

CP cases exercise subprocess CLI, a persistent stdio MCP process, the desktop
entry, cross-transport retry/outcome lookup, reused-ID rejection, competing stale
writes, a deliberately lost response, stale session rejection and notification/
invalid-tool boundaries. Receipt/read results are detached values: callers cannot
mutate accepted content or cached receipts through returned objects. Token/Origin
checks constrain the test relay; full grants/security qualification is separate.

[The JSON case contract](experiments/r07-two-view/matched-comparison-contract.json)
owns case IDs, invariants and strict criteria. Current receipts are in-memory;
reset invalidates the session and loses outcomes. In-page protection and this
relay must never be described as crash-safe disk persistence or sync.

## History lifetime finding

HC-06 is an explicit destructive lifecycle probe added for the comparison, not a
shipping Origin close/reopen button or a previously passed native UI route. It
recreates an EditorView with its previous public props/EditorState. The current
Y undo plugin destroys its manager observation with the view. Its old undo stack
can still execute once, which is why testing only the first undo would miss the
lost redo/new-edit tracking. The strengthened probe checks all three.

This is a composition/ownership gap, not evidence that Yjs inherently cannot keep
context history. The step candidate already keeps history-bearing EditorState in
its Context while destroying views. Any replacement must preserve that ownership
contract without retaining destroyed editors, private observer calls or library
patches. The conservative guards likewise remain exploratory, not approved
final user experience.

## Next bounded engineering work

Implement and qualify context-owned history lifetime for the Origin integration,
then narrow the two demonstrated disjoint-refusal boundaries while keeping nested
foreign text and structural-content controls. Reuse this exact contract; record
new results alongside these, never overwrite them. Do not add more product UI or
start production migration to evade a failed gate. No manual testing is requested
by this comparison; native retesting is a separate decision after integration
changes affect the qualified input surface.

After history ownership and refusal boundaries are reviewable, exercise a real
durable authority with shared app/CLI/MCP operations, retained operation outcomes,
restart faults and task/asset closure. Then compare complete compositions for R08.
No choice of canonical store, desktop host, editor framework or provider protocol
is accepted by this slice. Native composition remains unavailable and VoiceOver
deferred at user request; no repeated onboarding prompts.

## Reproduction and evidence

From the isolated experiment directory with its existing pinned dependencies and
a Playwright Chromium installation (or CHROMIUM_EXECUTABLE pointing to Chromium):

- npm test —67 Node checks, including one pre-existing raw-history diagnostic.
- npm run test:comparison — discovery with pass/refusal/gap distinctions.
- npm run test:comparison -- --strict — currently exits 1 for the three open gates.
- Existing browser/origin/table/support/capture suites remain the scoped regressions.

[Executed evidence](evidence/r07-27-2026-11-14.json) retains exact manifests, the
initial adapter-wiring failure, discovery/strict runs and existing raw controls.
No new dependency/version, Swift or production file changed. The isolated package
adds scripts/entrypoints; root package manifests/locks remain untouched. No Mac
build of this new experimental command bridge is claimed.

The stdio subset pins protocol 2025-11-25, checked against the official
[transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
and [lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
specifications. It is not full MCP conformance or MCP Streamable HTTP.
