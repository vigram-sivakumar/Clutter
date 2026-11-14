# Resume Clutter foundation work

Last updated: 2026-11-14. Documentation revision: 0.5.
Read this file first in a new chat or agent session. It is the checkpoint, not a
second product specification. [README](README.md) identifies authoritative docs.

## Current position

Product direction has been clarified with the user. Technical architecture is
not finalized. Foundation documents, proposed ADRs and acceptance specifications
exist; production implementation and qualification spikes have not started as
part of this foundation work. R01 is complete as a bounded capability audit, with
45 entries and selected existing-test evidence. R02 now has a reviewable interaction
specification and 72 seed cases, none executed; Q-01–Q-09 policy review remains open.
Next is R03 conditional document-model/API drafting, informed by R02 without treating
source/structured alternatives as settled product decisions.

| Area                                  | Verified status at this checkpoint                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product requirements/behaviour        | Recorded in product-contracts.md and product-behaviour.md; remaining detail gaps are explicit                                                                     |
| Architecture/API/history/sync         | Proposed contracts, not implemented target mechanisms                                                                                                             |
| Technology selection                  | PM/Tiptap and local SQLite are candidates; no accepted replacement decision                                                                                       |
| Existing test evidence                | 30 selected Linux files/1,003 assertions passed across initial and targeted reruns. Initial load errors and setup corrections are retained in inventory/evidence. |
| Native/platform/provider tests        | No new macOS/native/provider qualification; the target architecture remains untested.                                                                             |
| Documentation checks                  | Formatting, relative links, requirement/test IDs and sequential patch application checked in handoff                                                              |
| Existing production and old documents | Unchanged by the foundation deliveries                                                                                                                            |
| Remote/user checkout                  | Prior 0.1–0.3 commits verified on remote branch at f22a5cd. New 0.4/0.5 patches are prepared; user application is not yet confirmed.                              |

## Repository and delivery state

Use the single branch `architecture/clutter-foundation`. Initial source baseline
was main `cae604273115c0c6c0d3ac34533b1e9834e9c778`; this is provenance, not a request
to reset to that commit. Preserve all later user commits and unrelated work.
At the R01 start, remote branch `f22a5cd182c171ae9bfaf22f7ac320019fb9a4ec`
contained the user's three documentation commits and exactly matched the local
0.3 files; this checkout was safely fast-forwarded to it. Production source is
unchanged from main `cae6042`. New 0.4 audit and 0.5 R02 changes are uncommitted.
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

Each update is incremental over its predecessor's file contents, not a particular
user-created commit hash. If this file is present at revision 0.5, do not blindly
reapply those patches. Inspect actual files and git state; do not use reset/clean,
force checkout or re-create the branch to hide divergence.

## Read order

1. [Roadmap](roadmap.md), then [R01 inventory](current-capability-inventory.md) and
   its [executed evidence](evidence/r01-2026-11-14.json).
2. [R02 interaction specification](editor-interaction-spec.md),
   [case catalogue](editor-interaction-cases.json) and policy ledger Q-01–Q-09.
3. [Product contracts](product-contracts.md) and [behaviour](product-behaviour.md).
4. [System architecture](system-architecture.md) and [shared API](shared-api.md).
5. [Sync/platform](sync-and-portability.md) and [history](history-and-collaboration.md).
6. [Decision register](decision-register.md), [ADRs](adr/README.md),
   [acceptance matrix](acceptance-matrix.md) and [qualification plan](qualification-spike.md).
7. [Delivery discipline](delivery-plan.md), current repository guidance and relevant
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

## Exact next action: R03 conditional specification drafts

Read R02 cases/profiles/policy ledger, then draft
`docs/foundation/document-model-spec.md` and `command-api-spec.md`. Specify stable
entity identity, task page/body/single note-or-inbox placement, custom versus
standard properties, reference/embed closure, version/asset/comment references,
copy/move/restore invariants and versioned command/query/precondition/outcome shapes.

Keep the semantic model independent of CM6 text offsets, PM internal node JSON and
physical storage. Trace commands and inverse preconditions to R02 cases. Where
Q-01–Q-09 affect splitting/joining/task title/clipboard/history, record alternatives
and dependencies; do not close them by arbitrary schema design or imply approval.
Ask one example-based product question only if it materially blocks the scoped
work; exploratory prototypes can inform profile choices later.

R02 is draft-complete, not approved/executed. Required variant expansion, nine
policy items and native evidence remain. R01's 1,003 existing assertions are not
R02 passes. No new runtime tests were run for R02; only documentation/catalogue
checks and patch reproduction. Production implementation remains gated.

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
