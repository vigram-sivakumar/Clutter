# First qualification spike

Status: qualification plan with a bounded R07 experiment now executed; see the
[R07 evidence](evidence/r07-2026-11-14.json). Native and full qualification remain
blocked. No production implementation is part of this change.

## Question and fixture

Can the proposed stack support reliable native editing, shared local views,
app/CLI/MCP operations, identity-bearing tasks and retained history, plus safe
optional provider reconciliation without a Clutter backend?

Build an isolated reproducible harness with pinned candidate versions, unpatched
controls, fixtures, failure injection and action traces. Compare the exact PM/Tiptap
composition against CM6, not simplified demos against the full app. The fixture
contains paragraphs, independently indented tasks, code/table, read-only page embed,
image/PDF and Unicode. There are no subtask or dynamic property-column requirements.

## R02 input and equivalent comparisons

Use [R02](editor-interaction-spec.md) and [EI fixtures/cases](editor-interaction-cases.json)
to prepare candidate adapters and explicit variation instances. The notation is
not a PM schema or canonical storage choice. Compare required shared behaviour
and Clutter task/page semantics, not identical source newline/marker/indent output.
Declare each candidate's source/structured key/selection profile. Profiles may be
explored while Q-01–Q-09 remain open, but count them as exploratory rather than
binding pass/fail. Freeze agreed outcomes before product acceptance. Maintain
native/IME/focus requirements for every model and do not count source-only syntax
checks against a candidate that has no editable syntax markers.

## R03 contract input

[Model](document-model-spec.md), [API](command-api-spec.md) and
[MC scenarios/operation registry](model-api-contract-cases.json) supply logical
ownership, preconditions, idempotency and outcome cases. Implement only a scoped
isolated harness after relevant contracts/wire shapes are ready; catalogue files
are not a runtime validator. Include stale restore after task move, retry after a
lost response with stale expected tokens, concurrent duplicate admission, pinned
historical task content and interrupted state/outcome/outbox persistence. Keep
M-01–M-07/Q-01–Q-09 policy gaps visible in pass/fail/blocked reporting.

## R04 failure input

Use [persistence contracts](vault-persistence-spec.md) and
[PF catalogue](persistence-contract-cases.json) to enumerate real fault points for
P-SQL/P-ROOT/P-TEXT candidates. Implement a scoped fault injector later, not a toy
checker that merely repeats the specification assertions. Retain before/after
roots, operation identities/outcomes, durability claims, asset reachability and
restart traces. Pin/read back actual backend configuration and native runtime.
A clean subprocess kill is not OS/power-failure proof. Relevant PS-01–PS-07 gaps
remain blocked until resolved; no failure case was executed in R04 documentation.

## Stage A: local vertical slice

1. Start one headless Space authority; attach two panes then two native windows
   to one document. Confirm local cursor/selection and shared accepted revisions.
2. Edit from views, CLI and MCP; test overlapping operations, stale replacement,
   repeat IDs, failed outcomes and recovery. Same-device guards remain enabled.
3. Exercise context undo, close/reopen/tab switching, missed events and owner takeover.
4. Create/open an inbox task; cut into a note, copy to create a new task, delete/
   restore and archive the owner. Verify one location per task, properties/body,
   task projection correctness and history. Convert a text/block to a page.
5. Pin a version, edit/restore with a revision guard, retain reachable assets and
   historical deleted content/comments. No automatic backup scheduler is required.
6. Test recurrence/reminders using a controlled clock, archive suppression and
   retry-safe next-occurrence generation, with dates advanced from original schedule.
7. Inject persistence/publication failures; close last view and restart the owner.
   Verify protected work, uncertainty reporting and history before current replacement. With sync enabled, inject a crash after local save
   but before upload; pending-publication intent must survive.
8. Execute actual macOS/WKWebView keyboard/IME/native menus and image/PDF/embed
   selection boundaries. Linux browser runs remain preliminary evidence.

## Stage B: provider sync qualification

Use two isolated local stores and controllable file delivery, not two connections
to one active DB in a synced directory. Exchange uniquely identified states;
concurrently edit one document; select a deterministic current state and retain
both histories. Test stale/out-of-order/duplicate delivery, clock skew, missing
media, offline restart, deletions, task moves and recurrence without duplicate
ownership/generation. Exercise dirty view/IME handling and remote-history boundaries.

Then qualify actual opted-in iCloud and Google Drive transport separately under
available native/provider environments. Cover permissions, partial downloads,
pending uploads, app-closed use, disable/re-enable and corrupted/untrusted input.
Verify upload acknowledgement versus mere staging, persistent retries, ingest/cursor
crash replay, safe rescan and no echo loops. Test next-startup catch-up with all
processes stopped, rather than assuming background sync exists. A simulated
transport pass is not a provider support claim. Block enabling an
unqualified provider rather than quietly falling back to shared-live-DB syncing.

## Deferred stage: future cloud collaboration

Live typing/cursors, membership roles and concurrent operation merging are not
initial blockers. Before cloud introduction, run isolated multi-person semantic
convergence, authorization/revocation and selective undo tests (T-22). Preserve a
versioned protocol seam now; do not mandate an unproven CRDT on future potential alone.

## Exit criteria

Publish pass/fail/blocked for the relevant T-01 through T-21 cases with exact
configuration, seed/action log and limitations. Scope comments according to their
agreed delivery phase; no claim of comment completion from a fixture-only schema.
Report core correctness, integration bugs and temporary dependency patches separately.
No production editor switch without native acceptance; no provider enablement
without durable overwritten versions and coherent task/delete reconciliation.

## R05 provider qualification boundary

Use [SC cases](provider-sync-cases.json) for protocol simulation and the
[feasibility record](provider-feasibility.md) for exact-route native experiments.
Resolve SY-04 and supply runnable fixtures/budgets before claiming convergence;
static review or successful file transfer is insufficient.

## R06 qualification preparation

[R06 readiness](qualification-readiness.md) defines the concrete first two-view
experiment and scoped entry gates. Use [editor qualification](editor-qualification-plan.md),
[budgets](qualification-budgets.json), [candidate template](qualification-candidate-template.json)
and [HQ scenarios](host-security-cases.json). Candidate locks/native environment and
relevant policy approval remain outstanding; no executed R06 proof is claimed.

## R07 first-slice evidence

[R07 experiment](experiments/r07-two-view/README.md) and [evidence](evidence/r07-2026-11-14.json)
implement the first bounded slice. Raw versus guarded history and the one-view
control remain distinct. Investigate BR-14/CT-01 without settle waits; keep native
and provider stages blocked until real environment/evidence exist.
