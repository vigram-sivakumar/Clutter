# Foundation documentation changelog

Specification revisions, not app releases or user document versions. The latter
are specified in [history](history-and-collaboration.md).

## 0.6 — 2026-11-14

- Added conditional R03 semantic model: entity identity/body, single task placement,
  typed custom versus standard fields, references, owned historical closure, media,
  tombstones, schema/refusal and metadata/settings boundaries.
- Added shared command/query draft with guards, retry deduplication before stale
  guards, outcome/durability distinctions, local authorization, safe inverses,
  coherent effect sets, reads/catch-up and internal provider capability boundaries.
- Added logical registry of 51 operation sketches and 24 unexecuted contract scenarios;
  these are not runtime APIs, full wire schemas or passing domain tests.
- Kept R02 Q-01–Q-09 and new model M-01–M-07 explicitly conditional; no engine,
  physical schema, encoding or database selected. Updated ADR/acceptance/handoff links.
- R04 conditional persistence/history/recovery/outcome/outbox specification is next.
  Production/older documents unchanged; no new runtime checks claimed.

## 0.5 — 2026-11-14

- Captured the user's clarification: the old Markdown editor is evidence, not a
  universal interaction target for new candidates.
- Added R02 interaction specification with shared reliability/Clutter semantics,
  explicit source/structured profiles and nine bounded policy-review items.
- Added 11 semantic fixtures and 72 seed cases (60 shared requirements, 12 profile
  proposals) with initial state/action/document/selection/focus/undo expectations.
  These are specification data, not canonical schema or executed tests.
- Covered native input/IME/accessibility, multi-view/history/focus, task identity
  and clipboard, tables, read-only embeds, images/PDFs and failure boundaries.
- Updated acceptance references, candidate qualification/ADR guidance and resume
  checkpoint. R02 draft is prepared; policy approval and execution are pending.
  Next is conditional R03 model/API drafting. No production/runtime changes.

## 0.4 — 2026-11-14

- Verified the user's prior three commits at remote f22a5cd and fast-forwarded this
  checkout after confirming matching files; audited production source inherited from cae6042.
- Added R01 inventory of 45 capabilities with live source/wiring, test evidence,
  target disposition, requirements, proposed owner and next validation.
- Identified stale table/properties/atomic-write documentation; task entity/inbox,
  history and provider gaps; local/remote concurrency distinctions; and source-level
  sidebar-versus-task-collection freshness risk (not a reproduced UI failure).
- Executed 30 selected existing Linux files: 1,003 assertions passed across the
  initial run and targeted reruns. Preserved initial two dependency-load errors,
  external runner path allowance and real workspace dependency-link correction.
  No production edits, extra mocks, checked-in config changes or native/provider tests.
- Marked R01 complete as a bounded inventory and R02 next; updated the resume
  checkpoint and reading order. Target architecture remains unqualified.

## 0.3 — 2026-11-14

- Clarified local-first reads/saves, persistent pending-publication intent, inbound
  replay/cursor handling, provider acknowledgement and separate local/sync status.
- Confirmed desktop/CLI/MCP use one save/history/sync pipeline with structured
  results; no assumed always-running service or Markdown canonical format.
- Added roadmap with dependencies and gates plus START-HERE checkpoint, patch
  prerequisites, read order, exact next task and reusable new-chat instructions.
- Current next task is the source-grounded capability inventory (R01). Technology
  choices remain unqualified; no production or native/provider test execution.

## 0.2 — 2026-11-14

Confirmed the user's question-by-question decisions and superseded earlier draft scope:

- Replaced dynamic custom-property columns with predefined collection fields;
  retained independent arbitrary typed note/task properties and copy-only templates.
- Added task pages, independent inbox, single-note-or-inbox placement, cut moves,
  independent copies, owner archive/delete and restore. Withdrew subtasks; indentation
  has no parent-task meaning.
- Specified schedule versus deadline, fixed-date/relative-label mentions, optional
  any-block reminders, archive suppression and no replay of missed reminders.
- Clarified recurrence: original schedule, next future slot after completion, skip
  missed slots, copied title/properties and empty next body. This replaces copy-body.
- Added selected-text/block conversion to linked pages and live read-only page embeds.
- Recorded deleted-block discussion recovery and user-pinned historical versions.
- Replaced initial live merge/presence requirement with optional qualified iCloud/
  Drive latest-document-wins, retaining overwritten states. Same-device guarded
  app/CLI/MCP operations remain. Deferred live cloud collaboration/sharing roles.
- Deferred public publishing, automatic backups and initial encryption; preserved
  snapshot boundary for later backups. Limited planned specialised media to images/PDFs;
  retained page embeds. Required macOS-first, Windows-ready code boundaries.
- Added behaviour/sync specs and ADR-F005; revised all active scope references and
  tests, separating initial/provider/future gates. Technology is not finalized.

Checks run for this delivery are described in the handoff; runtime cases remain
specified, not executed. Old documentation and production code were not modified.

## 0.1 — 2026-11-13

- Created isolated foundation documentation from main `cae6042`.
- Defined ownership, app/CLI/MCP API, ADR proposals and qualification matrix.
- Added provisional multi-view, history and live-collaboration scope, revised in 0.2.
