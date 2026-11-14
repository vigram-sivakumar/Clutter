# R07 qualification review and next engineering gate

Revision 0.35, 2026-11-14. This closes the current guided manual session; it does
not select a production editor, document representation, host or vault backend.

## Current conclusion

The user confirms every guided test they performed passed. The tested table
profile, cross-view text undo/redo, native menu/focus/clipboard paths, formatting,
step view lifetime/history and injected in-page protection are useful positive
evidence. Repeated/accidental Pass clicks do not invalidate those confirmations
and do not create extra test executions. Do not restart these manual prompts.

[Progress](NATIVE-TEST-PROGRESS.md) owns the detailed manual sequence. The latest
[raw report review](evidence/r07-26-2026-11-14/review.json) preserves the original
file, hashes, attempts and interpretation. Stored NM-07/NM-09 labels exist in both
candidates with ready captures. NM-08 is a confirmed manual pass despite its raw
UI status still being not-run. Do not edit the source report to reconcile that.
NM-03 real input composition is unavailable; NM-06 VoiceOver was deferred by the
user. Neither is passed. Origin has no Bold toolbar or view-close control here;
its Command-B result does not prove an absent toolbar route.

## What the candidates have and have not established

| Area                          | Guarded step candidate                                                                    | Origin-aware candidate                                                      | Remaining qualification                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Current input/table profile   | Scoped Linux and user-reported native paths pass; triple-click fix has saved pass/capture | Same scoped profile, with its available UI routes                           | Full editor catalogue, native multiline/IME/accessibility, large workloads                         |
| Context history               | Conservative protection may refuse unsafe inverses; close/reopen history reported working | Text-origin undo scoped checks pass; structural undo conservatively guarded | Compare exact preservation and refusal boundaries; no claim that raw history is safe               |
| Shared operations and CLI/MCP | Node adapters tested separately; browser authority not connected to those processes       | No equivalent CLI/MCP or persistence slice                                  | Matched command semantics over one authority; live app/headless parity before technology selection |
| Persistence/recovery          | Browser lab protection and separate Node file adapter; native website storage ephemeral   | In-memory authority                                                         | Real durable revisions/outcomes, restart faults, migration and asset reachability                  |
| Native windows                | A/B share one document inside the candidate window                                        | A/B share one document inside its window                                    | Candidate windows are independent; shared-document OS-window coordination remains unqualified      |
| Product document/task model   | Fixture-level blocks                                                                      | Fixture-level blocks                                                        | Task/page identity/lifecycle, version pin/restore, schema migrations and ownership closure         |
| Providers                     | Not implemented                                                                           | Not implemented                                                             | Opt-in provider packaging/reconciliation proof; no live SQLite file in a synced directory          |

No candidate may win because it has more prototype controls, because current
production already uses a library, or because another candidate lacks adapters
that were never built. Compare complete, equivalently scoped compositions.

## Executed bounded R07 work: history/authority parity

The [matched comparison](r07-matched-comparison.md) now executes the next contract
with the same fixture, accepted-state assertions and context identities. It
retains raw controls and exposes three strict gates. Its covered questions:

1. A batched insertion with B inserting inside it; A undo/redo preserves B.
2. Disjoint foreign edits: distinguish a successful own inverse from a conservative
   refusal rather than calling both the same user experience.
3. A-added row/column, B editing new cells, then A undo/redo: preserve B or visibly
   refuse the unsafe inverse; never silently delete foreign content.
4. Focus/history surviving view close/reopen and delayed authority delivery.
5. One externally issued command interleaved with view edits: same accepted
   revisions and history ownership, with no interface writing storage independently.

Record each observed inverse/refusal/rejection and its reason. Demonstrate the
public adapter mechanism without private observer flushes or library patches.
Any remaining product choice about refusal UX must be explicit before accepting
an architecture. Existing tests are inputs, not proof that the complete contract
or CLI/MCP transport parity already exists. Do not rebuild production here.

After the matched history boundary is reviewable, qualify the durable authority
and shared app/CLI/MCP operations with real restart/fault tests. R08 architecture
baseline review can then consume equivalent evidence and list any accepted
exceptions. The whole editor/platform/provider matrix remains separate; current
manual successes do not silently complete it.

## Delivery and continuation

The next agent reads START-HERE, AGENTS, the progress log, this review and latest
raw evidence. Stay on architecture/clutter-foundation; retain all user work and
old reports. Documentation patch10 is incremental over the exact bundle09 target;
no source/dependency/Swift changes or native rebuild. User commits it locally.

Current next action: context-owned history lifetime and narrower disjoint guards,
as specified in the matched comparison. The older capability table describes the
manual-slice checkpoint; the new live three-operation bridge now has matched tests.
Bundle11 updates the handoff; no technology accepted.
