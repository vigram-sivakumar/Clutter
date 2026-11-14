# Sync, concurrency and platform boundaries

Status: confirmed product policy; protocol/provider support unqualified.
Implements P-05, P-08, P-16, P-19 through P-24, P-27, P-35.

## Three separate forms of concurrency

| Situation                                              | Initial contract                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Same device: tabs/windows/app/CLI/MCP                  | One local Space authority; ordered operations, stale-write guards and context-specific undo                                 |
| Different devices through opted-in iCloud/Google Drive | Latest whole-document state wins; retain overwritten states in version history; no automatic text/structural merge required |
| Future cloud live collaboration                        | Deferred live typing/presence, participant permissions and collaborative merge/undo; separate qualification before enabling |

Latest-wins sync does not disable revision checks for local UI or external AI
commands. A stale local replacement is rejected or explicitly resubmitted; remote
competing states enter a dedicated reconciliation command with provenance/history
capture through the same domain/persistence owners. No sync adapter writes around
the shared API.

## Provider scope

The user wants opt-in iCloud and Google Drive support in Clutter settings, if
technically feasible. Local-only operation remains complete and usable offline.
No Clutter-operated backend is required initially. Scope provider/device grants
and lifecycle in the settings spec; whether the toggle is application-wide or
per Space remains a design question.

Each device has its own local database/store. Do not put the actively written
SQLite database/WAL in a provider folder and call that coordinated multi-device
access. Provider delivery is file transfer, not Clutter transaction serialization.

Candidate approach, not a selected protocol: publish immutable, validated document
state packages plus referenced assets/history identifiers; ingest them locally
idempotently. Keep active DB, locks, recovery and local view state outside the
replicated file set. Other designs must meet the same constraints. Provider APIs,
folder transport, OAuth/sandbox access, availability and Windows compatibility
need actual qualification; support for either provider is not claimed yet.

## Local-first save and transfer lifecycle

Editing and ordinary reads use the local store. Saving must not wait for an
internet connection. Each device holds a local replica; the provider carries
transferable states/assets, not a second independent local body authority.

Proposed durable outbox pattern, to qualify in D-03/D-08:

1. Accept an operation through the shared core and commit local state/history
   together with persistent pending-publication intent. Avoid a gap where a save
   succeeds but a crash forgets that the change still needs uploading.
2. Report local durability immediately when justified. Publish the corresponding
   state/required assets asynchronously when opted-in transport is available.
3. Record acknowledged transfer progress durably and retry idempotently. Immutable
   state identity allows safe retry after uncertain upload completion. Do not
   collect referenced content/assets while publication or history still needs them.
4. On provider changes/startup/resume, discover and download required state/assets,
   validate completeness/identity/schema, then ingest through core reconciliation.
   Protect local dirty input, retain overwritten versions and update open views.
5. Persist inbound progress/cursors only consistently with durable ingestion, or
   make replay safe. Expired discovery cursors require safe rescan. Reprocessing
   a received state must not create an endless upload echo or duplicate occurrence.

Define recoverable handling for partial/missing assets rather than marking an
incomplete state fully available. A failed transfer never rolls back a good local
save. A rejected/malformed inbound package never overwrites local current content.
These are contract requirements; no outbox/storage/transport implementation is
selected by this section.

## Status and process lifetime

Local save state and provider transfer state are separate axes. A note may be
saved locally while sync is pending, offline, retrying or blocked by access loss.
Expose enough status for recovery without interrupting ordinary typing.

“Synced” may mean this client has provider-confirmed publication and has ingested
known remote changes; it cannot prove that every other device has downloaded them.
Do not claim all-device synchronization from one successful upload. An iCloud
folder write may only be locally staged; distinguish that from provider-confirmed
availability when the platform exposes it. Specify limitations of provider evidence.

The desktop, CLI and MCP all create the same durable pending work through core.
A desktop window is not required, but a running process is required to perform
Clutter-controlled transfer. With every Clutter process stopped, delivery may
wait until next startup unless a separately specified background agent is enabled.
OS/provider transfer of already-published files does not itself run Clutter's
validation/reconciliation logic. No always-running agent is selected or promised.

## Winner selection and historical preservation

The confirmed policy accepts whole-document replacement. Concurrent edits to
different sections are not automatically merged; the non-current state stays
recoverable in version history, including its required assets.

D-08 must specify revision identity, known ancestry, deterministic ordering and
tie-breaks for genuinely concurrent states. Causally newer states must not lose
to delayed older deliveries. Device clock time or file mtime alone is insufficient.
Without a trusted clock/service, 'latest' cannot promise exact real-world typing
order; specify the deterministic protocol meaning before implementation.

All replicas given the same states converge to the same current state irrespective
of delivery order/retries. Capture both competing states durably before dropping
either from current state. A later-arriving losing state also becomes historical.
A provider may not deliver every state if files overwrite each other; the protocol
must preserve uniquely identified states rather than assume history it never saw.

Document/archive/delete metadata, task placement/moves, recurrence and assets
cannot be reconciled as unrelated files with arbitrary winners. D-08/D-13 must
settle the atomic reconciliation unit and entity/tombstone rules. Whole-document
latest-wins must not produce a task in two notes, resurrect deleted work from an
old delivery, or generate a repeat twice. If validity is uncertain, preserve the
received package and expose a sync error rather than apply corrupt state.

Dirty local work and active IME must be protected before applying a remote winner.
Define selection mapping and interactive-history rebase/invalidation at this
boundary; never reset an editor mid-composition or present remote changes as a
local undo group. Retained version restore remains the recovery path after a
whole-state replacement even if a local undo group becomes invalid.

## Cloud transport is not a permission service

A shared provider folder can expose delivered content to whoever can access that
folder. It does not implement Clutter's future page-level viewer/commenter/editor
roles, presence or live typing. Do not promise private page access inside a shared
Space export. History and assets have the same transport visibility as their data.

Disabling sync stops future Clutter transfer; it cannot erase already delivered
copies. Define pending transfer handling, source removal, credential expiry,
permission loss, malicious/malformed package validation and oversized inputs.
No encrypted-Space promise is made for the initial release.

## macOS first, Windows-ready structure

Separate semantic/domain commands, schema validation, persistence orchestration,
version history, sync policy and CLI/MCP contracts from OS implementations.
Inject concrete filesystem/locking, credential storage, picker, notification,
clipboard, menu, shortcut and window services at composition roots. Avoid macOS
imports in shared domain modules and avoid broad speculative platform wrappers.

Keep platform-neutral identifiers and path abstractions; test case sensitivity,
reserved names, separators, Unicode, atomic-replace/flush differences and provider
paths when adding Windows. File formats/protocols must not embed macOS bookmark
bytes as portable identity. Native tests remain platform-specific; a Windows
adapter cannot claim support from macOS test results alone. This is a repository
boundary requirement, not a Windows implementation commitment now.

## Future compatibility

Automatic backups are deferred, but the persistence/history/asset owners need a
consistent snapshot manifest and reachable-root boundary for later backup tooling.
No automatic backup scheduler, rotation UI or provider backup service is required
now. Native export is not described as automatic backup.

Encrypted Spaces are not initial scope; future support was not decided. Keep secret
handling behind platform boundaries without choosing keys/encryption now. Live
collaboration should have versioned operation/protocol extension points, but no
initial CRDT/server requirement is imposed solely for a deferred feature.

## R04 persistence boundary for R05

[Vault persistence](vault-persistence-spec.md) supplies proposed local state/outcome/
outbox commit, inbound replay/progress, asset publication and root-retention contracts.
It does not choose provider packaging/order, tombstone retirement or cross-document
remote reconciliation. Those are R05 work. Local-only operation needs no unbounded
disabled-provider queue; enabling sync must establish the explicitly specified
current/history baseline instead of assuming every earlier edit was queued.
