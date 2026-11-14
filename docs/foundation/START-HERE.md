# Resume Clutter foundation work

Last updated: 2026-11-14. Documentation revision: 0.3.
Read this file first in a new chat or agent session. It is the checkpoint, not a
second product specification. [README](README.md) identifies authoritative docs.

## Current position

Product direction has been clarified with the user. Technical architecture is
not finalized. Foundation documents, proposed ADRs and acceptance specifications
exist; production implementation and qualification spikes have not started as
part of this foundation work. The next task is roadmap R01, the capability inventory.

| Area                                  | Verified status at this checkpoint                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Product requirements/behaviour        | Recorded in product-contracts.md and product-behaviour.md; remaining detail gaps are explicit        |
| Architecture/API/history/sync         | Proposed contracts, not implemented target mechanisms                                                |
| Technology selection                  | PM/Tiptap and local SQLite are candidates; no accepted replacement decision                          |
| Native/platform/provider tests        | No new runtime tests executed for this documentation work                                            |
| Documentation checks                  | Formatting, relative links, requirement/test IDs and sequential patch application checked in handoff |
| Existing production and old documents | Unchanged by the foundation deliveries                                                               |
| Remote/user checkout                  | Applying/committing/pushing delivered patches is not confirmed; inspect the actual repo              |

## Repository and delivery state

Use the single branch `architecture/clutter-foundation`. Initial source baseline
was main `cae604273115c0c6c0d3ac34533b1e9834e9c778`; this is provenance, not a request
to reset to that commit. Preserve all later user commits and unrelated work.
The working copy used for preparation has uncommitted foundation files. No commit
or push was performed for the user. A new environment may differ; do not assume
scratch paths, commit IDs for the docs or installed dependencies.

Delivered patch order:

1. Initial foundation docs, revision 0.1: `Clutter-Foundation-Docs.patch` (the user
   may have downloaded it as `Clutter Foundation Docs.patch`).
2. Scope update, revision 0.2: `Clutter Foundation Scope Update.patch`.
3. Sync/roadmap/resume update, revision 0.3: `Clutter Foundation Resume Update.patch`.

Each update is incremental over its predecessor's file contents, not a particular
user-created commit hash. If this file is present at revision 0.3, do not blindly
reapply those patches. Inspect actual files and git state; do not use reset/clean,
force checkout or re-create the branch to hide divergence.

## Read order

1. [Roadmap](roadmap.md), including the first next task and exit criteria.
2. [Product contracts](product-contracts.md) and [behaviour](product-behaviour.md).
3. [System architecture](system-architecture.md) and [shared API](shared-api.md).
4. [Sync/platform](sync-and-portability.md) and [history](history-and-collaboration.md).
5. [Decision register](decision-register.md), [ADRs](adr/README.md),
   [acceptance matrix](acceptance-matrix.md) and [qualification plan](qualification-spike.md).
6. [Delivery discipline](delivery-plan.md), current repository guidance and relevant
   source/tests. Old production rules remain binding until explicitly superseded.

## Guardrails for resuming

- The user's clarified product scope overrides withdrawn 0.1 proposals. Use the
  current specs rather than earlier chat recommendations. Do not reopen settled
  questions unless a specific contradiction or failure requires a decision.
- All new architecture/specification documents stay in `docs/foundation/`; preserve
  old documentation. Do not rewrite root architecture rules in a documentation task.
- One shared domain API supports app/CLI/MCP. Keep canonical entity state and
  derived views separate; independent replicas/history are deliberate, not extra owners.
- Provider sync is optional and unqualified. No shared-live-SQLite approach, automatic
  merge promise, implied page-level permissions from provider-folder access, or
  assumption that background sync runs after every process exits.
- Architecture quality, reliability and UX decide choices. Record migration/effort
  for planning with zero decision weight. Existing code is evidence, not a constraint.
- Do not treat a completed specification or earlier research count as a passing
  implementation. Earlier PM focus-patch/FTS findings need original artifacts and
  reproduction; those artifacts are not embedded in this foundation pack.
- Current authorized continuation is documentation/specification. Do not begin a
  production rebuild merely because the roadmap describes later implementation.

## Exact next action: R01

Inspect current source, UI wiring and tests, then create
`docs/foundation/current-capability-inventory.md`. For each capability record:
source anchors, what live code establishes, relevant test evidence, old-doc
contradictions, confirmed target requirement IDs, keep/redesign/retire/unresolved,
next validation and owning subsystem. Preserve product guarantees rather than
requiring reuse of their implementation. Do not invent runtime evidence from
static reading. Classify without asking the user the entire question list again.

Cover notes/daily notes/templates/folders, tasks/properties/collections, navigation/
views, editor input/clipboard/undo, assets/embeds, history/recovery/persistence,
search/backlinks/settings and automation/platform boundaries. R01 is not complete
until every group is accounted for and missing coverage is explicit.

## Session close protocol

At each meaningful handoff: update this checkpoint's date, completed roadmap IDs,
exact next action, verified evidence/limitations and actual branch/patch status.
Update roadmap statuses and changelog in the same change. Link specifications and
run artifacts rather than duplicate their rules here. Never mark tests passed
without execution, or assume that the user applied a patch because it was delivered.

## Reusable new-chat instruction

> Continue Clutter foundation work on architecture/clutter-foundation. Read
> docs/foundation/START-HERE.md, then follow its read order and current roadmap task.
> Inspect git state and repository guidance first. Preserve existing work, stay on
> this branch and keep new documentation under docs/foundation/. Report what is
> confirmed, proposed and tested separately. Follow the checkpoint's authorized
> scope; do not restart product discovery or implement a production rebuild by assumption.
