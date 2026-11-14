# ADR-F006: Origin-aware structured editing with transactional roots

Status: **Proposed for joined qualification**, 2026-11-14, revision 0.38.
Decisions D-01/D-02/D-03/D-05/D-07/D-09. No production ADR is superseded.

## Context and evidence

The [matched history proof](../r07-history-ownership.md) passes its bounded strict
contract; Origin applies13 cases with2 protective refusals, step11 with4. The
[durable proof](../r07-durable-authority.md) separately passes18 Linux cases with
PM JSON snapshots and tiny in-database blobs. Neither proves their combination.
The raw unguarded Origin structural undo failures remain relevant controls.

## Proposal

Use direct PM with Clutter semantic schema and Yjs origin-aware history for the
next isolated slice. Keep history owned by editing contexts, never EditorViews;
keep selection/focus/navigation per view. Tiptap is not required or qualified by
PM results. Shared domain commands admit all desktop/CLI/MCP changes.

For the joined synthetic fixture, make a versioned encoded accepted Y-state the
single committed document payload. SQL metadata supplies Space/document IDs,
revision/parent, codec version, original outcome and closure references. Decode PM
JSON to validate and render; do not persist a second independently writable JSON
or Markdown body. This is a new experimental codec, not an accepted production
format or an assertion that build13 already stores Yjs.

Stage a proposed operation against an isolated engine state. Validate semantic
invariants, actor/context admission and closure before the SQL commit. Commit the
new root/revision/original receipt together; only then publish accepted changes.
Never mutate the live accepted Y.Doc and promise to undo it if the SQL commit fails.
Pending editor replicas are provisional and must be reconciled/protected without
silently deleting input or resetting every view. An unknown COMMIT result must be
resolved by stable outcome identity before any new-ID retry or accepted publication.
The commit truth and live engine must reconcile before further mutation admission.

Y update/origin metadata is not an authorization grant. Public CLI/MCP operations
remain semantic commands; editor payloads use a separately bounded authenticated
session protocol, validated final semantics and safe failure handling. A client
cannot claim another context's ownership by naming its origin.

Retained version roots are distinct from interactive UndoManager stacks. Preserve
history across tab/view detach; this proposal does not promise to serialize engine
undo stacks across process restart. Restart opens a defined interactive-history
boundary while retained/pinned document versions remain readable. Qualify any
stronger restart-undo promise separately.

## Consequences and alternatives

This addresses observed local selective history behavior. It adds codec migration,
engine identity/GC/retention, staging, replay, typed command/inverse and memory costs.
Conservative table refusals still need UX review; fewer refusals alone is not a
complete selection score. Yjs does not establish future live cloud behavior and
must not override the confirmed latest-document provider policy.

The PM step candidate remains the fallback. P-ROOT/text-oriented candidates are
unqualified alternatives, not demonstrated failures. Production entity/typed
property/task placement storage is still M-06/M-03: prove one authoritative payload
per entity, atomic moves and historical restore closure. Do not adopt the embedded
synthetic task as a production layout. See the [review](../architecture-review.md).

## Acceptance and impact

[JG-01–JG-10](../joined-core-contract.json), targeted native history/input, entity/
asset closure JG-12/JG-13, defined budgets and the gap ledger must pass at their
specified gates before a scoped accepted successor. Record exact packages, codec,
SQLite build/settings, OS/filesystem, failure phase and source hashes. For macOS,
compare the actual flush/checkpoint profile with existing confirmed-flush promises
(including any required full-flush semantics); SQL synchronous FULL or a process
kill alone cannot silently replace a stronger native durability contract.

Would affect concrete ownership in ADR-001/002/003/010/031/062/063 and the document
portion of073; preserve one capability/commit owner and app/window boundaries.
The [review's impact map](../architecture-review.md) identifies links and the
required full call-site/ADR audit before acceptance. No root rules or old ADR
statuses are modified by this proposal.
