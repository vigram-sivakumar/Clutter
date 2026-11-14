# Resume Clutter foundation work

Last updated: 2026-11-14. Documentation revision: 0.6.
Read this file first in a new chat or agent session. It is the checkpoint, not a
second product specification. [README](README.md) identifies authoritative docs.

## Current position

Product direction has been clarified with the user. Technical architecture is
not finalized. Foundation documents, proposed ADRs and acceptance specifications
exist; production implementation and qualification spikes have not started as
part of this foundation work. R01 is complete as a bounded capability audit, with
45 entries and selected existing-test evidence. R02 now has a reviewable interaction
specification and 72 seed cases, none executed; Q-01–Q-09 policy review remains open.
R03 now has conditional model/API drafts, 51 logical operation signatures and 24
unexecuted contract scenarios. M-01–M-07 model gaps and Q-01–Q-09 interaction gaps
remain explicit. Next is R04 conditional persistence/history/recovery/outcome/outbox
specification; no target library/format/backend is accepted.

| Area                                  | Verified status at this checkpoint                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product requirements/behaviour        | Recorded in product-contracts.md and product-behaviour.md; remaining detail gaps are explicit                                                                     |
| Architecture/API/history/sync         | Proposed contracts, not implemented target mechanisms                                                                                                             |
| Technology selection                  | PM/Tiptap and local SQLite are candidates; no accepted replacement decision                                                                                       |
| Existing test evidence                | 30 selected Linux files/1,003 assertions passed across initial and targeted reruns. Initial load errors and setup corrections are retained in inventory/evidence. |
| Native/platform/provider tests        | No new macOS/native/provider qualification; the target architecture remains untested.                                                                             |
| Documentation checks                  | Formatting, relative links, requirement/test IDs and sequential patch application checked in handoff                                                              |
| Existing production and old documents | Unchanged by the foundation deliveries                                                                                                                            |
| Remote/user checkout                  | Prior 0.1–0.3 commits verified on remote branch at f22a5cd. New 0.4–0.6 patches are prepared; user application is not yet confirmed.                              |

## Repository and delivery state

Use the single branch `architecture/clutter-foundation`. Initial source baseline
was main `cae604273115c0c6c0d3ac34533b1e9834e9c778`; this is provenance, not a request
to reset to that commit. Preserve all later user commits and unrelated work.
At the R01 start, remote branch `f22a5cd182c171ae9bfaf22f7ac320019fb9a4ec`
contained the user's three documentation commits and exactly matched the local
0.3 files; this checkout was safely fast-forwarded to it. Production source is
unchanged from main `cae6042`. New 0.4 audit, 0.5 R02 and 0.6 R03 changes are uncommitted.
No commit or push was performed by the agent. Inspect a new environment rather
than assume these statuses, scratch paths or installed dependencies.

Delivered patch order:

1. Initial foundation docs, revision 0.1: `Clutter-Foundation-Docs.patch` (the user
   may have downloaded it as `Clutter Foundation Docs.patch`).
2. Scope update, revision 0.2: `Clutter Foundation Scope Update.patch`.
3. Sync/roadmap/resume update, revision 0.3: `Clutter Foundation Resume Update.patch`.
4. R01 audit/checkpoint update, revision 0.4: `Clutter Foundation Capability Inventory.patch`,
   based on remote commit `f22a5cd` (the prior three are confirmed committed there).
5. R02 specification, revision 0.5: `Clutter Foundation Editor Interactions.patch`,
   incremental over the exact 0.4 inventory delivery contents.
6. R03 model/API, revision 0.6: `Clutter Foundation Model API.patch`, incremental
   over the exact 0.5 delivery contents.

Each update is incremental over its predecessor's file contents, not a particular
user-created commit hash. If this file is present at revision 0.6, do not blindly
reapply those patches. Inspect actual files and git state; do not use reset/clean,
force checkout or re-create the branch to hide divergence.

## Read order

1. [Roadmap](roadmap.md), then [R01 inventory](current-capability-inventory.md) and
   its [executed evidence](evidence/r01-2026-11-14.json).
2. [R02 interaction specification](editor-interaction-spec.md),
   [case catalogue](editor-interaction-cases.json) and policy ledger Q-01–Q-09.
3. [R03 document model](document-model-spec.md), [command API](command-api-spec.md)
   and [operation/scenario catalogue](model-api-contract-cases.json), including M-01–M-07.
4. [Product contracts](product-contracts.md) and [behaviour](product-behaviour.md).
5. [System architecture](system-architecture.md) and [shared API](shared-api.md).
6. [Sync/platform](sync-and-portability.md) and [history](history-and-collaboration.md).
7. [Decision register](decision-register.md), [ADRs](adr/README.md),
   [acceptance matrix](acceptance-matrix.md) and [qualification plan](qualification-spike.md).
8. [Delivery discipline](delivery-plan.md), current repository guidance and relevant
   source/tests. Old production rules remain binding until explicitly superseded.

## Guardrails for resuming

- The user explicitly stated current Markdown interactions are not a complete
  target for new candidates. Preserve reliability and Clutter semantics, compare
  declared source/structured profiles, and do not force PM to mimic Markdown keys
  or select an engine by assuming its defaults.
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

## Exact next action: R04 conditional persistence specification

Read R03 model/API/registry plus R02 policy ledger, then draft
`docs/foundation/vault-persistence-spec.md`. Compare backend encodings against
coherent effect sets, current versus retained state, pinned version/task/comment/
asset closure, durable outcome/deduplication, recovery and pending-publication intent.
Specify failure/uncertainty/restart behaviour and cleanup/snapshot roots before
selecting implementation. A transaction name is not evidence of atomicity across
files/assets/provider transfer.

Keep technology options open and record how each meets DM invariants. Do not
silently settle M-06 canonical structure/provider-unit encoding or impose PM node
JSON/Markdown mechanics. Preserve M-01–M-07/Q-01–Q-09, and state which affect each
backend design. Define how old operation identities remain protected after outcome
compaction, how pinned historical task content is reconstructed, and how restore
plans reject stale/moved-task closure. R05 later specifies provider winner/delivery.

R02/R03 are draft-prepared, not approved/executed. No new runtime interaction/domain/
protocol tests were run for their delivery. R01 evidence remains separate. Validate
new documentation/data consistency and produce an incremental patch; production
implementation remains gated. Ask only a material blocking product question with
an example, rather than re-running the answered questionnaire.

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
