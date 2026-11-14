# Version history and multi-person collaboration

Status: required product capabilities with proposed mechanisms. This document
expands P-05, P-12 and P-17 through P-22 without fixing a vendor or sync engine.

## Four different guarantees

| Mechanism                | Purpose                                                   | Ownership/lifetime                                               |
| ------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------- |
| Interactive undo/redo    | Reverse eligible actions from one editing context         | Context-local metadata mapped through subsequent operations      |
| Document version history | Inspect and restore retained historical document states   | Durable Space-managed records with provenance                    |
| Crash recovery           | Recover pending work interrupted before normal durability | Durable recovery records until reconciled/discarded              |
| Backup                   | Recover a Space after storage loss/corruption             | Independently restorable content, history, identities and assets |

None substitutes for another. Version history stored only on the failed device
is not a backup. Retained snapshots and replicas are intentional data with defined
authority, not competing writable copies of current content.

## Retained versions

The logical history record identifies document, version, schema, causal/revision
boundary, content reference, asset references, origin, actor, wall-clock display
time and restore provenance. Wall-clock time is not concurrency ordering. A
collaborative version identifies a consistent causal cut or equivalent checkpoint,
not a concatenation of partially applied remote edits.

Automatic version grouping, explicit checkpoints, labels and pins must be
specified. Not every keystroke needs a user-visible version. A retained version
must reconstruct its supported semantics even after storage compaction/schema
migration, or be explicitly readable through a compatible decoder.

App, CLI and MCP share list/inspect/compare/export/restore semantics. Diff should
explain text, structural, property and asset changes. Version access is permission
checked; joining a Space must not silently grant historical access beyond policy.

Restore is a guarded new mutation based on a chosen version. It preserves the
old version and records who restored it. It never rewinds the whole Space or
overwrites edits accepted since preview. Restoring deleted blocks must handle
identity reuse/reference integrity explicitly. Full-document restore and partial
restore are separate capabilities; partial restore is not implied by a diff UI.

Retained references keep assets alive. Purge has a visible scope across current
content, versions, trash, checkpoints, replicas and backups; it cannot promise
immediate removal from offline devices or independently retained backups. Define
retention duration, storage budget, compaction and pinned-version rules before
release. A missing historical asset is surfaced, not disguised as a complete restore.

## Collaborative document contract

Multiple participants, each with multiple local views, edit one logical document.
The architecture must define stable document/block identities, operation identity,
causality, schema compatibility and deterministic merge behaviour for:

- Concurrent insertion/deletion and formatting at the same text boundary.
- Move versus edit, delete versus edit, duplicate block identities and nesting.
- Tables, task toggles, properties, links and asset publication.
- Restore/checkpoint creation concurrent with normal editing.

CRDT, server-ordered transformation and other models remain candidates. A
convergent text sequence alone does not guarantee valid tables, permissions or
correct semantic merges. Use one shared semantic validator and merge policy.

Presence/cursors are ephemeral, participant-scoped and allowed to expire; they do
not create document versions or drive canonical ordering. Anchor selections to
mapped positions and preserve local focus. Remote activity must not steal focus.

Undo reverses only eligible local-context operations while preserving independent
remote work. Define the case where remote content depends on a locally inserted
block: deleting that block blindly is unacceptable. A refused or narrowed inverse
must be explicit. Engine-specific undo and generic version restore cannot both
silently own interactive history.

## Offline access and authorization

Local edits remain usable offline under the supported policy and survive restart.
On reconnect, clients exchange missing operations idempotently and converge or
surface a recoverable semantic conflict. A rejected edit remains exportable or
recoverable rather than vanishing.

Define who authorizes membership, roles, invitations and revocations. Revocation
cannot erase data already downloaded. Offline writes accepted locally may be
rejected for shared publication after revocation; the UI must distinguish local
pending work from shared acceptance. Do not promise immediate revocation on an
offline replica. History access, asset access and restore need the same authority.

Decide local-network versus hosted collaboration, encryption/key ownership,
identity provider and schema upgrade coordination before selecting a sync vendor.
A database file shared via a cloud-synced folder is not the proposed protocol.

## Required qualification

Use two participants with isolated durable replicas, multiple views, network
partition, reorder/duplicate delivery, restart and revoked access. Assert semantic
convergence after catch-up, valid structure, selective undo, durable pending work,
correct history/asset reachability and permission outcomes. Same-process views
are insufficient evidence for multi-person correctness.
