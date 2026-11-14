# Product contracts

Status: product direction confirmed in the 2026-11-14 discussion; technical
mechanisms remain proposed and unqualified. See the scope and behaviour details
in [product behaviour](product-behaviour.md) and [sync and portability](sync-and-portability.md).
These contracts describe the target, not today's application.

## Product principles and release boundary

Clutter is a local-first notes app. App, CLI and MCP are core interfaces over one
shared command and vault API. macOS ships first with shared code and platform
boundaries ready for Windows. There is no Clutter-hosted service initially.

Local editing, tasks, history, multiple views and image/PDF embeds belong in the
initial architecture. Opt-in iCloud/Google Drive sync is desired, subject to
qualification per provider. Live multi-person editing and sharing roles are future
cloud-service capabilities, not initial qualification gates. Automatic backups
and encrypted Spaces are not initial features. Math, diagrams and drawings are
outside the planned content scope.

One source of truth means one owner per fact/rule, not a ban on historical versions,
recovery records or revision-tagged projections. Migration/implementation effort
is visible for planning with zero influence on architectural selection.

## Requirements

| ID   | Contract                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-01 | Stable entity/view identities survive rename/move. Copy creates new identities; reference and restore policies are explicit.                                                                                                                     |
| P-02 | App, CLI and MCP use one shared capability API, validation and access boundary. Headless use works without a window.                                                                                                                             |
| P-03 | Keyboard, selection, Enter/Shift+Enter, Tab/Shift+Tab, deletion, clipboard and undo/redo are reliable on actual macOS/WKWebView.                                                                                                                 |
| P-04 | Tabs, panes and windows are views of the same accepted document state with local cursor, selection, scroll and focus.                                                                                                                            |
| P-05 | Interactive undo is document/context scoped, survives tab switches and cannot silently undo independent local-context changes. Remote snapshot replacement has an explicit history-rebase/reset contract.                                        |
| P-06 | Pending, accepted, recovery-protected and durable work are distinguishable. Failed/uncertain writes never become an unqualified saved indicator. Local durability and provider sync status are separate; local saves do not wait for networking. |
| P-07 | Closing views, removing Spaces or losing access cannot discard unprotected pending work.                                                                                                                                                         |
| P-08 | Missed/duplicate/out-of-order notifications trigger revision reconciliation, not silent divergence.                                                                                                                                              |
| P-09 | External AI uses CLI/MCP for documents, tasks and metadata with guarded writes, including headless use.                                                                                                                                          |
| P-10 | Documented native interchange preserves supported semantics/IDs/assets; Markdown conversion reports losses.                                                                                                                                      |
| P-11 | Search, backlinks, collection/task views are derived, revision-tagged and rebuildable.                                                                                                                                                           |
| P-12 | Current, historical, pinned, trashed and recovery-held asset references govern retention and collection.                                                                                                                                         |
| P-13 | Archive/delete/restore propagate to all views and owned tasks. Logical deletion and irreversible purge are distinct.                                                                                                                             |
| P-14 | Tabs have independent navigation; focused UI context determines command targets; headless commands name targets explicitly.                                                                                                                      |
| P-15 | Layout/preferences persist separately and never hold the only pending content.                                                                                                                                                                   |
| P-16 | Same-device app/CLI/MCP processes coordinate through one local Space authority. No independent competing window writers.                                                                                                                         |
| P-17 | App/CLI/MCP support retained version inspection, comparison, pinning, export and guarded restore as a new revision.                                                                                                                              |
| P-18 | Undo, version history, recovery and backup are separate. Pins survive automatic cleanup; automatic backups are deferred with a consistent snapshot boundary reserved.                                                                            |
| P-19 | Future cloud service supports live multi-person editing; initial sync uses whole-document winner selection with retained overwritten versions, not automatic merging.                                                                            |
| P-20 | Future individual-page sharing supports viewer/commenter/editor without sharing the whole Space. Public publishing is deferred; current local/tool authorization still applies.                                                                  |
| P-21 | Local/offline work survives restart. Qualified provider sync converges deterministically, preserving received overwritten states in history. Pending transfers survive restart and replay is idempotent.                                         |
| P-22 | Versioned schemas/protocols support validation, migration and safe refusal of unsupported content.                                                                                                                                               |
| P-23 | Keyboard-only accessibility, visible focus, screen-reader semantics and native input/IME are first-class requirements.                                                                                                                           |
| P-24 | AI/network/tool access is explicit. Provider sync is opt-in in settings; no implicit Clutter-hosted backend.                                                                                                                                     |
| P-25 | Notes/tasks own arbitrary typed custom properties. Collections expose predefined fields, not columns inferred from custom labels/types.                                                                                                          |
| P-26 | Tasks are identity-bearing entities with page content, standard fields and exactly one location: a note or independent inbox.                                                                                                                    |
| P-27 | Task move/copy/delete/archive rules preserve single location and identity correctly; indentation never creates subtasks.                                                                                                                         |
| P-28 | Repeating tasks retain completed occurrences and follow the original schedule after completion, skipping missed occurrences.                                                                                                                     |
| P-29 | Templates are copied on application; no continuing link or update propagation.                                                                                                                                                                   |
| P-30 | Selected text/blocks can become pages with reference links left behind. Live page embeds are read-only and open the original for edits.                                                                                                          |
| P-31 | Date mentions store fixed dates with relative labels. Any block can have a separately enabled reminder; tasks separate schedule and deadline.                                                                                                    |
| P-32 | Note archive suppresses its tasks/reminders; restoration resumes future reminders without replaying missed ones.                                                                                                                                 |
| P-33 | Deleting a commented block removes its discussion from current content; undo/version restore recovers both. Comments must never silently reanchor to unrelated text.                                                                             |
| P-34 | Initial media scope includes images and PDFs. Math, diagrams and drawings are outside planned scope.                                                                                                                                             |
| P-35 | Domain, persistence, provider sync and API policy remain independent of macOS-specific integrations so Windows does not require a structural rewrite.                                                                                            |

## Specification completion

The product-behaviour document owns the detailed rules behind P-25 through P-33.
The sync document owns cross-device scope and the distinction from local API
concurrency. Do not infer a full Notion-style database product from typed properties.

Inventory current capabilities as keep/redesign/retire/unresolved before production
implementation. Complete the editor matrix across text/blocks, positions, nesting,
forward/backward selections, modifiers, widgets/tables, composition and focus.
Engine defaults and older Markdown indentation rules are evidence, not automatic
new-product decisions.

The user has settled the listed product directions, not every UX detail or storage
mechanism. Retention budgets, field vocabulary/default visibility, task-aware
cross-device consistency, provider winner ordering, comment delivery phase and
performance budgets remain explicit design work in the decision register.
