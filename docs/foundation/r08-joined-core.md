# Joined editor and durable-authority result

Revision0.39, 2026-11-14. **JG-01–JG-10 pass on the recorded Linux profile.**
Two actual PM/Y editor views now use a real durable-owner process through the
shared command path. This closes G-J's bounded integration gap; it does not accept
a production stack or qualify native/entity/external-asset gates JG-11–JG-13.

[Executed evidence](evidence/r08-15-2026-11-14.json) and the
[implementation boundary](experiments/r07-two-view/joined/FORMAT.md) distinguish
actual results from the unchanged [0.38 contract](joined-core-contract.json).
Its original not-run fields are the frozen specification, not the current report.
The user authorized this implementation. Application of review14 has not been
explicitly confirmed; delivery supports exact13 and exact14 without guessing.

## Implemented ownership

The real child owner reads the authoritative SQLite root, stages a full proposed
Y update in an isolated document, validates the fixture and commits the encoded
Y root/revision/original outcome in one transaction. Only after COMMIT can it
publish a hint. There is no accepted document in the driver or Playwright relay.
PM JSON is decoded validation/rendering output; SQL stores only the versioned
Y-state BLOB and root metadata, with no independent PM/Markdown body.

The browser RemoteAuthority is a revision-tagged cache plus provisional contexts.
It reuses the existing Origin context/history/view/table code. A/B have real
EditorViews and separate selections. Contexts and their history survive actual
view destruction. Pending commands keep stable identity until committed outcome
and projection reconciliation are known. Reconnecting cannot change Space/document
identity, and out-of-order old reads cannot reduce the accepted revision.

The earlier SQL Store now accepts a codec/domain port; both snapshot and Y profiles
share transaction, outcome, recovery and host transport implementations. CLI is
the same thin command client; joined MCP reuses the stdio handler. No duplicate
SQL transaction engine or separate task policy was added. Default snapshot stores
and joined stores have distinct markers; neither silently migrates the other.

## Executed joined cases

| Case  | Observed result                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JG-01 | Persisted Y BLOB reconstructs both actual editor views after true owner restart; Space/document IDs and fixture task identity retained                                                                                                  |
| JG-02 | Injected main-save failure leaves accepted root/revision/receipt old, A's input/history pending and B unchanged; retry then undo works                                                                                                  |
| JG-03 | SIGKILL before COMMIT, after COMMIT and before reply resolves through the same operation; injected uncertain COMMIT blocks later mutations until lookup resolves it                                                                     |
| JG-04 | Alternating same-target A/B edits and real CLI/MCP operations converge; selections remain independent                                                                                                                                   |
| JG-05 | Nested foreign text survives undo/redo; context history survives both views being destroyed/remounted and captures subsequent edits; disjoint formatting and row/column inverses apply;2 overlapping table cases are explicitly refused |
| JG-06 | Failed protection blocks actual view close; successful full-draft protection precedes destruction; reattach/retry saves once                                                                                                            |
| JG-07 | Newer generation survives stale cleanup and restart; explicit same-base recovery applies once, stale-base recovery preserves its conflict draft; interactive-history restart boundary declared                                          |
| JG-08 | Lost hints/echoed retry do not lose a paused view's input; explicit revision catch-up converges without duplicate effect                                                                                                                |
| JG-09 | Wrong context/public-token raw updates, forged origin, malformed/oversized state, changed task ID/state, embed target and extra Y roots are rejected; later valid editing works                                                         |
| JG-10 | Browser, CLI and MCP race one operation with one original receipt/effect; changed reuse/wrong destination/second or paused-owner takeover/old token fail                                                                                |

The overall ten cases pass, while two JG-05 unsafe structural inverses remain
**protective refusals**, not successful applied undo. The broader matched history
contract is unchanged:24 pass/6 explicit refusals, strict exit0. Existing84 Node
checks pass, including the preserved raw-history diagnostic; default durable18
cases pass, native-support6 checks pass, and table candidates retain66 passes.
Two raw unguarded Origin table failures remain negative controls, not acceptance.

## Findings corrected during qualification

The first attempts exposed a paused-input queue integration issue, a same-origin
reconnect restriction and an incorrect expected insertion order in a recovery test.
A later profile-reporting variable shadow prevented startup and was corrected.
Those original runs remain retained, not overwritten or reclassified as passes.
Restart tests now deliberately rebind the same HTTP origin with fresh credentials;
this does not solve installed endpoint discovery/relocation.

A focused negative control found that protection could accept an extra Y root even
though restart would reject that closure. The corrected common joined codec validates
root kinds for accepted **and protected** input. The expanded JG-09 rejects this
before a recovery record can commit. The pre-fix diagnostic is retained separately.
No assertion was weakened to accept a storage/history failure; the recovery test's
text ordering was corrected to the declared insertion-before-Alpha action.

Structural pending-history tags now wait for durable acceptance, then bind their
scope to the committed fixture table. This is one-table fixture support; it does
not replace the required production block/table identity model. Client queues are
not discarded merely because the reply arrived: scope/projection reconciliation
must finish, and retry can resolve the same receipt if that follow-up read fails.

## Limits and next gate

Executed: Node24.22.1, SQLite3.53.4, Linux x64 and Chromium, exact SQLite build,
PRAGMA readbacks, OS/filesystem type, source manifest, root hashes and operation
receipts in retained evidence. SQL WAL/FULL/exclusive settings and actual SIGKILL
boundaries establish only this tested process-failure profile. Lost COMMIT return
is synthetic after a real COMMIT; no VFS/power/OS failure guarantee is claimed.

The fixture is one document/one table with an embedded task and no external media.
It does not qualify production entity placement/property layout, stable block IDs,
full task lifecycle, image/PDF publication/render, GC, migrations, provider sync,
full public API/security conformance or scale/performance budgets. Interactive undo
stacks remain session-only; retained document history and protection are distinct.
The shared JS proof is not a production TypeScript package or selected shipped
runtime binding. Rust may implement shell/platform services; it must not duplicate
semantic document/task/command rules. No shell/language baseline is accepted here.

**Next: prepare the targeted Mac/installed-headless candidate for JG-11.** Connect
the same joined owner to native editor views, pin/package its runtime, and prove
app-closed CLI/MCP startup, actual native input/history/lifecycle, grants/ownership
and flush profile. The existing Swift host still runs the old fixture and must
not be presented as this new proof. Do not request another broad manual replay;
ask for targeted checks only when a concrete Mac runner is ready. IME remains
unavailable and VoiceOver deferred; prior manual passes stay valid.

JG-12 task-identity/restore closure and JG-13 external assets remain the already
recorded G-M gates before related baseline acceptance; they are not newly added
research. Keep the [review gate order](architecture-review.md) and [gap ledger](architecture-gap-disposition.md).
No production implementation, accepted ADR, provider enablement, agent commit or
push is authorized by a passing G-J slice alone.

## Native runner preparation, revision0.40

[Runner16](r08-native-runner.md) is prepared;8 Linux helper checks pass, not native
compilation/execution or JG-11 acceptance. Next actual Mac launch/setup output and
then targeted JN-01. Earlier evidence and remaining model/security/asset gates are
unchanged; no production stack selected.
