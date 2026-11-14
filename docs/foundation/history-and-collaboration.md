# Version history and future collaboration

Status: product history policy confirmed; technical design proposed. Live
collaboration deferred. See [sync and portability](sync-and-portability.md) for
initial provider reconciliation rather than the withdrawn mandatory merge design.
References: P-05, P-12, P-17 through P-22, P-27, P-33.

## Four different guarantees

| Mechanism                | Purpose                                                                     | Lifetime/authority                                                                     |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Interactive undo/redo    | Reverse eligible actions from one editing context                           | Context metadata mapped through accepted changes; explicit remote-replacement boundary |
| Document version history | Inspect/restore retained document states, including overwritten sync states | Durable records under the Space/history owner                                          |
| Crash recovery           | Protect pending work after interrupted durability                           | Recovery records until explicitly reconciled/discarded                                 |
| Backup                   | Recover after storage loss/corruption                                       | Future independent consistent copy; automatic feature deferred                         |

Local history is not a backup of a failed disk. Historical versions and recovery
records are intentional immutable/protected data, not competing current documents.

## Retained versions and pins

A logical version records document/version IDs, schema, revision/ancestry boundary,
content and asset roots, origin/device/context, display time and restore provenance.
Wall-clock timestamps are for display, not the sole sync ordering rule. Automatic
checkpoint cadence, retention duration and storage budgets remain open.

Users can pin versions. Automatic retention/compaction must preserve a pinned
version's reconstructability and reachable assets until explicitly unpinned or
deleted. Unpinning removes protection, not necessarily the version immediately.
Explicit deletion/purge behaviour must not masquerade as automatic cleanup.

App/CLI/MCP share inspect/compare/pin/export/restore semantics. Initial sync must
retain both winning and overwritten document states as specified in the sync
contract, even when the losing state arrives later. Provider snapshots and package
staging must protect this data before current state changes.

Restore is a guarded new mutation, never destructive rewind. It records source
version/provenance and preserves later historical states. A stale preview cannot
silently replace a newly changed current document. The latest-wins remote policy
does not authorize an unguarded local restore.

## Identity and content closure

Version restore must account for task ownership/placements, deleted tasks,
block-comment threads, custom properties and asset references. A note deletion
cascades to its owned tasks; note restoration brings them back. If a historical
task has since moved elsewhere, restore must not create duplicate ownership:
specify whether to restore a copy, relocate under confirmation or refuse in D-02.
Do not invent that choice in the storage adapter.

Historical states include the deleted block's associated discussions so undo or
restoring that content can recover both. This is a data closure guarantee, not a
promise that every current live discussion is overwritten on a page restore.
Detailed comment/version boundary rules remain to specify before comment delivery.

Retained/pinned versions, trash, pending moves and recovery determine asset
reachability. Schema migrations must keep retained history readable or preserve a
compatible decoder. Missing historical media must be surfaced as incomplete
rather than reported as a successful full restore.

## Future collaboration boundary

Live typing, presence, permissions and selective multi-person undo are future
cloud-service features. Initial canonical schema and command ownership must
leave a clean protocol/operation seam, but a CRDT representation or server is
not selected or required now.

Before enabling collaboration, qualify concurrent structural/text edits, causal
checkpoints, anchored comments, membership/revocation including historical access,
offline write rejection and selective undo across two isolated replicas. Do not
assume current latest-whole-document-wins provides that experience. Preserve
recoverability of locally rejected work when future server rules are introduced.

## R03 closure and API references

[Document-model DM-10–DM-12](document-model-spec.md) defines retained owned-state
closure, including historical task bodies, placement and comment/asset references.
Ordinary links/embeds do not recursively snapshot/restore their entire target graph.
The rendering must label current versus retained target expansion honestly.
[API restore plans](command-api-spec.md) recheck current closure tokens at commit;
M-04 keeps the moved-task collision policy explicit. Pin metadata has its own
history-catalog revision instead of pretending the current body was edited.
