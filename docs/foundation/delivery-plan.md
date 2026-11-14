# Delivery and review plan

Status: revised product scope; technology/specification work remains proposed.
This change authorizes documentation updates, not production implementation.

| Gate               | Reviewable result                                                                              | Completion                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| G0: scope          | Confirmed behaviour, phase boundaries and current capability inventory                         | User directions captured without withdrawn requirements; inventory still to complete         |
| G1: specification  | Editor matrix, schema/task identity, API, persistence/history, scheduler and provider protocol | Resolve behaviour/transaction gaps in qualification scope; every fact/rule has one owner     |
| G2: qualification  | Local/native vertical slice and separate provider evidence                                     | Relevant initial tests pass; enabling each optional provider requires its own pass           |
| G3: baseline       | Accepted ADRs and end-to-end technical specification                                           | Evidence-based choice, trade-offs, explicit supersession of affected current rules           |
| G4: implementation | Production local slice through app/CLI/MCP                                                     | Domain/persistence/protocol/native tests, recovery/history and entity contracts pass         |
| G5: expansion      | Remaining initial features, qualified opt-in providers and release readiness                   | Declared scope verified; future live collaboration/automatic backup are not initial blockers |

## Scope and future gates

Initial priorities include dependable macOS input, task pages/inbox/predefined
views, note-owned typed properties, copy-only templates, date/reminder/recurrence,
image/PDF plus read-only page embeds, durable history/pins, local multi-view and
headless API parity. Provider sync is opt-in and desired subject to qualification.

Future cloud service adds live collaboration and page-sharing roles. Automatic
backups are deferred with a consistent snapshot boundary preserved. Encrypted
Spaces are not initial scope; math/diagrams/drawings are outside planned scope.
Comment behaviour is agreed, but delivery timing remains an explicit scope item.

## Specifications to complete

Expand this same folder with non-overlapping detailed specifications: existing
capability inventory, editor/input outcomes, canonical entity schema and migrations,
task/placement/version closure, vault/media layout, API/IPC schemas, provider order/
transport/trust, scheduler/time zones, UI/navigation/accessibility and performance.
Live cloud membership/merge and automatic backup have later specifications.

Do not label the architecture finalized because product questions were answered.
No production editor/storage decision is ratified until its relevant gates pass.

## Implementation discipline

For each increment identify requirement IDs, accepted ADRs, signatures/owners,
affected callers, failure outcomes and checks. Resolve missing contracts before
implementation rather than invent identity, storage, scheduling or permission
policy in an adapter. Review dependency direction, duplicate rules, direct writes,
authoritative caches, editor resets and destructive lifecycle transitions.

Use meaningful domain/property tests, failure injection, adapter parity and native
input checks. Do not report specified tests as executed or future gates as current
passes. Preserve reproducible regressions and distinguish temporary patches from
maintainable dependency choices.

## Branch and patch handoff

Continue `architecture/clutter-foundation`; do not create phase branches unless
instructed. All changes stay in `docs/foundation/`; old documents and production
code remain untouched. Preserve unrelated user changes/commits.

The 0.2 patch is incremental over the exact 0.1 foundation patch contents, regardless
of the user's local commit ID. Apply it after the first patch, on the same branch.
A combined patch is only for a checkout that has neither delivery. Every handoff
states prerequisite/scope/checks; never apply both combined and incremental to the
same checkout. No commit/push occurs unless explicitly requested.
