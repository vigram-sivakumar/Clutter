# ADR-074: Task Inbox and configurable creation destination

Status: Accepted for the Task Inbox implementation, per the approved feature requirements

## Context

Global New task currently stores its Markdown in today's Daily Note (ADR-044). An Inbox must reuse the same task occurrences, parser, operations, UI and persistence rather than introducing another task store. The approved feature adds an explicit Tidy up action, including completed tasks.

## Decision

- `.clutter/inbox.md` is the sole Markdown-content exception inside `.clutter`; the directory remains outside the Folder model. The document uses ordinary Page identity/frontmatter and source-body machinery with a null parent. It is excluded from ordinary note lists, search and link/embed suggestions. Opening its source resolves to the Tasks Inbox collection.
- Startup and root rescans load this exact file through DocumentLoader/PageBuilder. Sync reconciles its file events and coalesced `.clutter` directory signals using its existing queue, guarded reads and rebuilding. Other internal files remain excluded. Missing Inbox means empty; first task creation materializes the file.
- Global creation has one workflow. An app-wide preference selects today's Daily Note (default), the explicit due date's Daily Note (today when undated), or Inbox. The due date remains inline metadata; later edits never relocate tasks. Inbox's contextual New action explicitly chooses Inbox.
- All task mutations retain TaskOperations -> PageOperations -> session/save or Persistence Gate. PageOperations coalesces simultaneous ensureAtPath calls and submits body transforms to the existing Persistence Gate queue so concurrent task additions cannot capture the same stale body; the existing save operation accepts an optional transform evaluated at dequeue time. Open-session edits retain their synchronous commit behavior. `mutateBodyAndSave(id, transform)` additionally verifies Durable state, accounting for the existing save-time normalization of open sessions while preserving their raw committed Markdown; requestSave alone intentionally does not throw on a failed session save and is not sufficient as a transfer boundary.
- The Inbox is another task collection dataset, without tabs or Source, using the shared List/Table renderer, task rows, menus, editing dialog and display preferences. Its collection configuration is separate so hiding Source does not alter All tasks. Inbox membership is source identity, independent of due date or completion state.
- Only the Unscheduled sidebar navigation is removed; all existing tab, grouping, filtering and saved-view behavior remains.

## Tidy up and interruption recovery

Tidy up includes every Inbox task with a valid due date, whether completed or incomplete, including tasks hidden by display settings. It preserves each complete original task line, including time, completion and unknown metadata, and preserves undated content in Inbox.

The TaskOperations workflow first saves a versioned Markdown-comment plan in the Inbox containing an operation UUID and exact source-body snapshot. It ensures each Daily Note through PageOperations, then saves the unchanged task lines with a Markdown-comment receipt identifying that operation/date. Only after all destinations reach Durable does it remove the selected source lines and the plan in one source save. Receipts remain outside task lines, allowing a retry to recognize a destination already written. They are transfer recovery metadata, not another task model or projection.

A repeated click shares the in-flight operation. After an interruption, a new TaskOperations instance reads the same durable plan; receipts prevent duplicate destination insertion. Inbox task mutations are refused while a plan is pending so an edit cannot invalidate the recorded source. The confirmation stays open on failure and explains that a retry finishes pending work. A corrupt plan or externally altered source is refused without removing originals. External removal or editing of recovery comments cannot be automatically reconstructed; the original content is kept for manual review. External modifications are still guarded by the existing persistence fingerprint policy.

This is recoverable multi-file transfer, not an atomic filesystem transaction. A failure can temporarily leave tasks in both locations; originals are never deleted before the destination is saved. No automatic rollback writes over external changes. Due-date changes after a move never trigger another move.

## Alternatives considered

A separate task index/store or direct filesystem Inbox writer would duplicate task identity and bypass the Persistence Gate. Merely changing the creation path would lose discovery on restart. An unjournaled append-then-delete would duplicate tasks on retry after a crash. These alternatives are rejected.

## Consequences

ADR-046's shared configuration still applies to ordinary task views; Inbox has its own configuration because Source is fixed, while reusing the same definition shape and renderer. ADR-044's default behavior remains unchanged. Its unconditional statement that creation never uses the due date as destination is narrowed for the explicit due-date preference and confirmed Tidy up action. User-created notes and task syntax are unchanged. Existing tasks are never migrated automatically. The app-wide preference follows existing localStorage/reset conventions.

## Verification (2026-11-14)

Base: `main` at `f797bf6298336cfe38e47ad818713ea1017d67b6`, rechecked against the remote before packaging.

- TypeScript check and production Vite build pass.
- Final focused regression run: 637 passing tests across 34 files, covering task creation/mutation, settings and reset, Inbox discovery/Sync, navigation/session identity, collection rendering and save-time normalization. TaskTabIndicator's three unrelated animation failures were tested separately against clean main.
- Broad run: 18,299 passed out of 18,337 tests across 976 files. All 36 unrelated failures were reproduced by exact assertion name on the unchanged base. Two additional failures were old assertions for the intentionally revised collection empty-state copy; those assertions were updated and pass in the final focused rerun.
- Transfer coverage includes identical task lines, completed state/metadata, due times, source preservation after a destination/save failure, repeated clicks, concurrent creation, and retry after a full filesystem scan/Vault rebuild following an interrupted destination save.
- Native macOS interaction was not exercised in this environment; no native commands or Rust code changed.

On macOS, smoke-check the three global creation destinations, Inbox's contextual New action, task editing/completion/deletion, and Tidy up with dated completed/incomplete and undated tasks before release.


## Follow-up: Inbox default and interactive collection links

Inbox is now the default and reset value for global New task. Explicit `today` and `due-date` preferences remain supported. Earlier versions removed the storage key when Today was selected, so an absent key cannot distinguish that former selection from an unset preference; both now use Inbox. Changing this default does not relocate any existing tasks.

Tidy up is shown only when the Inbox contains a task with a valid due date (including completed tasks), and is hidden while a transfer runs. Its existing brush icon and button styling are retained.

Task collections opt into URL activation in the existing compact Markdown renderer. The shared tokenizer retains destinations only for that opt-in, using the same parsed Link/URL nodes and the destination decoder extracted from the existing editor link context menu; standard Markdown links display their existing label. The inner title becomes a real anchor while the outer element retains strike ownership. Its selectors share the editor’s existing link color/cursor and underline rules, without duplicating declarations or restoring commented-out compact CSS. Opening uses the existing external-URL helper, and activation does not open the task row. Other compact rendering callers retain their current passive behavior and span shapes. Executable and local-file anchor destinations are not activated.

Follow-up verification against `main` at `c6d8d6b123d80375222cc8443e207b358c39a37e`: 639 focused tests pass across 37 files, including the existing editor link tests, List/Table link activation, default/reset preference behavior and Tidy up availability. The separate bullet-style CSS contract failure also reproduces on the unchanged base; the previously verified task-badge animation failures are outside this focused run.
