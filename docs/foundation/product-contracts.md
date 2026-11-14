# Product contracts

Status: draft requirements. These describe the target product, not today's app.

## Product principles

Clutter is a local-first notes workspace with dependable authoring, rich content,
user-owned data and core app/CLI/MCP access. Multiple views and multiple people
operate on document identities rather than independent copies. Collaboration
must preserve an excellent single-person, offline experience.

One source of truth means one owner for each fact and rule. It does not forbid
replicas, immutable history, recovery records or rebuildable indexes. Each such
representation needs a named authority, revision and reconciliation rule.

## Requirements

| ID   | Contract                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-01 | Document, block, Space, folder, window, pane and tab identities survive rename/move. Copy creates new identities with explicit reference handling.                                               |
| P-02 | App, CLI and MCP expose the same supported domain capabilities through one shared API, validation and permission model. Headless use works without a window.                                     |
| P-03 | Typing, navigation, selection, Enter, Shift+Enter, Tab, Shift+Tab, Backspace, Delete, clipboard and undo/redo behave predictably on actual macOS/WKWebView.                                      |
| P-04 | A document can appear in multiple tabs, panes and windows. Views converge on shared accepted edits while retaining local interaction state.                                                      |
| P-05 | Undo/redo is scoped to document and editing context, persists across tab switches and does not accidentally reverse another context's or participant's edits. Unsafe inverses are explicit.      |
| P-06 | Pending, accepted, recovery-protected and durable edits are distinguishable. Failed/uncertain writes never become an unqualified saved indicator.                                                |
| P-07 | Closing a view cannot destroy pending work. Shutdown, Space removal and access loss preserve work or report a recoverable failure before discarding it.                                          |
| P-08 | Delayed, duplicated or missed notifications cannot cause silent divergence; resume/reconnect reconciles authoritative state and revisions.                                                       |
| P-09 | External AI can read/create/edit notes, tasks, metadata and relationships through CLI/MCP, including with the UI closed. Stale writes are rejected or explicitly merged.                         |
| P-10 | Portable native export preserves supported semantics, identities and assets. Markdown import/export declares losses; no private database is required to understand the documented native export. |
| P-11 | Search, backlinks and task lists derive from accepted documents/metadata. Cache loss cannot lose canonical content; freshness is observable.                                                     |
| P-12 | Asset references remain valid through move, history restore, backup and recovery. Garbage collection respects every retained reference, not only current documents.                              |
| P-13 | Rename, move, archive, restore, delete and Space removal reconcile active/inactive views. Deletion and permanent purge are distinct operations.                                                  |
| P-14 | Each tab has independent navigation. Focused window/pane/view determines UI command targets; headless mutations always name their targets.                                                       |
| P-15 | Layout/preferences have explicit owners and persist separately from content. Missing destinations restore gracefully without inventing documents.                                                |
| P-16 | Multiple local processes coordinate access to one vault. They cannot create competing in-memory authorities or silently overwrite accepted work.                                                 |
| P-17 | Users can list, inspect, compare, label, export and restore retained document versions through app/CLI/MCP. Restore creates a new current revision.                                              |
| P-18 | Automatic history, explicit checkpoints, interactive undo, recovery and backup have distinct contracts. Retention and purge are visible and protect pinned versions.                             |
| P-19 | Multiple people can edit the same document, retain their own selections and undo contexts, and converge under concurrent text and structural edits.                                              |
| P-20 | Membership and roles govern reads, edits, sharing, history and restore. Presence is ephemeral; access revocation and offline edits have explicit reconciliation rules.                           |
| P-21 | Supported offline edits survive restart and reconnect. Merge conflicts, rejected writes and unsupported schema versions never silently discard content.                                          |
| P-22 | Versioned schemas/protocols support validation, migrations and safe refusal by older clients. Unknown rich content must be preserved opaquely or refused explicitly.                             |
| P-23 | Accessibility includes keyboard-only workflows, focus visibility, screen-reader semantics and platform text input/IME.                                                                           |
| P-24 | Content is not sent to AI providers by Clutter implicitly. Tool access, collaboration networking and export are explicit user-controlled boundaries.                                             |

## Workflow coverage

Detailed UI specs must cover loading, empty, ready, pending, offline, conflicted,
permission-denied, deleted and recovery states for each relevant workflow:

- Create/edit notes, daily notes, templates, tasks, properties, tags and links.
- Add/open/replace attachments and embeds; show missing or unsupported content.
- Find/search, backlinks, collections and logical organisation.
- Open/switch/close tabs, split panes, move views between windows and restore layout.
- Read/edit via CLI/MCP; checkout/commit when file access is the useful interface.
- Inspect/restore history; archive/delete/restore and deliberately purge.
- Invite participants, change access, edit together, disconnect and reconnect.
- Backup/restore a whole Space, including retained versions and required assets.

This is a target scope inventory, not a claim that every existing feature was
fully audited. The detailed PRD must map existing capabilities to keep, redesign,
retire or unresolved, with explicit decisions before feature implementation.

## Editor contract completion

P-03 must be expanded into a reviewed input matrix for paragraphs, headings,
lists/tasks, tables, code, links, embeds and custom widgets. Specify positions
(start/middle/end), empty states, nesting, forward/backward and cross-block
selections, modifier keys, focus transitions and composition. Include Unicode
clusters, bidirectional text, native menus and assistive technology.

Actual outcomes for ambiguous cases belong in that matrix before implementation;
engine defaults and historical Markdown indentation rules are evidence, not an
automatic product decision. Candidate engines must execute the same contracts.

## Decisions still needed

Version retention duration and storage budget; history visibility after access
changes; participant roles and invitation UX; offline authorization expiry;
collaboration hosting/encryption; simultaneous overlapping undo policy; duplicate
tab policy; checkpoint cadence; performance budgets and supported document sizes.
Track resolution in the decision register rather than guessing in code.
