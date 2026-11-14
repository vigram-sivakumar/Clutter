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
