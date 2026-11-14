# First qualification spike

Status: specification only, updated to confirmed initial scope. No prototype or
production implementation is part of this documentation change.

## Question and fixture

Can the proposed stack support reliable native editing, shared local views,
app/CLI/MCP operations, identity-bearing tasks and retained history, plus safe
optional provider reconciliation without a Clutter backend?

Build an isolated reproducible harness with pinned candidate versions, unpatched
controls, fixtures, failure injection and action traces. Compare the exact PM/Tiptap
composition against CM6, not simplified demos against the full app. The fixture
contains paragraphs, independently indented tasks, code/table, read-only page embed,
image/PDF and Unicode. There are no subtask or dynamic property-column requirements.

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
   Verify protected work, uncertainty reporting and history before current replacement.
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
A simulated transport pass is not a provider support claim. Block enabling an
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
