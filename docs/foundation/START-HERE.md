# Resume Clutter foundation work

Last updated: 2026-11-14. Documentation revision: 0.12.
Read this file first in a new chat or agent session. It is the checkpoint, not a
second product specification. [README](README.md) identifies authoritative docs.

## Current position

Product direction has been clarified with the user. Technical architecture is
not finalized. Foundation documents, proposed ADRs and acceptance specifications
exist; production implementation has not started. The first isolated R07
qualification slice has now run, with blocking observations. R01 is complete as a bounded capability audit, with
45 entries and selected existing-test evidence. R02 now has a reviewable interaction
specification and 72 seed cases; the full catalogue remains unqualified and
Q-01–Q-09 policy review remains open.
R03 now has conditional model/API drafts, 51 logical operation signatures and 24
unexecuted contract scenarios. M-01–M-07 model gaps and Q-01–Q-09 interaction gaps
remain explicit. R04 adds a conditional persistence specification and 30 unexecuted
fault cases across P-SQL/P-ROOT/P-TEXT; PS-01–PS-07 are still open. R05 adds a conditional provider protocol, official-source feasibility record and 30
unexecuted SC scenarios. SY-01–SY-08 remain open; SY-04 coherent task reconciliation
blocks provider enablement. R06 prepared qualification contracts. R07 has two executed Linux exploratory slices and now a prepared native Mac host.
Targeted selection/origin-history alternatives pass their scoped Linux checks;
raw failures remain controls. The new AppKit/WKWebView source, eight-case checklist
and automatic report runner are ready for the first Mac build, not natively verified.
Swift/macOS SDK and actual native input are unavailable here. See [native preparation
evidence](evidence/r07-03-2026-11-14.json) and [run guide](experiments/r07-two-view/native-macos/README.md).

| Area                                  | Verified status at this checkpoint                                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product requirements/behaviour        | Recorded in product-contracts.md and product-behaviour.md; remaining detail gaps are explicit                                                                                                                                                              |
| Architecture/API/history/sync         | Proposed contracts, not implemented target mechanisms                                                                                                                                                                                                      |
| Technology selection                  | PM/Tiptap and local SQLite are candidates; no accepted replacement decision                                                                                                                                                                                |
| Existing test evidence                | 30 selected Linux files/1,003 assertions passed across initial and targeted reruns. Initial load errors and setup corrections are retained in inventory/evidence.                                                                                          |
| Native/platform/provider tests        | Linux core/browser exploratory evidence now exists; macOS/native/provider qualification remains blocked.                                                                                                                                                   |
| Documentation checks                  | Formatting, relative links, requirement/test IDs and sequential patch application checked in handoff                                                                                                                                                       |
| Existing production and old documents | Unchanged by the foundation deliveries                                                                                                                                                                                                                     |
| Remote/user checkout                  | Remote 0.9 commit 1215044 verified and matched local docs; branch safely fast-forwarded. User reports R07-01 applied; R07-02 and native R07-03 prepared; application of 02 not independently verified. No new remote commit verified or agent commit/push. |

## Repository and delivery state

Use the single branch `architecture/clutter-foundation`. Initial source baseline
was main `cae604273115c0c6c0d3ac34533b1e9834e9c778`; this is provenance, not a request
to reset to that commit. Preserve all later user commits and unrelated work.
At the R01 start, remote branch `f22a5cd182c171ae9bfaf22f7ac320019fb9a4ec`
contained the user's three documentation commits and exactly matched the local
0.3 files; this checkout was safely fast-forwarded to it. Production source is
unchanged from main `cae6042`. At R07 start, the user's remote foundation commit
`1215044bb61339a98dc128229bf31f69aab769d7` contained the exact local 0.9 docs. After
staging those matching contents, this worktree fast-forwarded to that user commit.
No stash, reset, force checkout, production merge or new agent commit/push occurred.
The earlier main advances were observed only; R01 evidence keeps its historical
baseline. R07 work is uncommitted and isolated under this folder. Inspect a new environment rather
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
7. R04 persistence, revision 0.7: `Clutter Foundation Persistence.patch`, incremental
   over the exact 0.6 delivery contents.

8. R05 provider sync, revision 0.8: `Clutter Foundation Provider Sync.patch`,
   incremental over the exact 0.7 delivery contents.

9. R06 qualification preparation, revision 0.9: `Clutter Foundation Editor Qualification.patch`,
   incremental over the exact 0.8 delivery contents.

10. R07 first experiment, revision 0.10: `Clutter R07 Two View Experiment 01.patch`,
    incremental over verified user commit 1215044 (the exact 0.9 contents).

The combined `Clutter Foundation Provider and Editor Recovery.patch` was an
alternative 0.7-to-0.9 delivery covering R05 and R06. Verified commit 1215044
contains those contents; do not reapply either route.

11. R07 blocker comparisons, revision 0.11: `Clutter R07 Editor Blocker Investigation 02.patch`,
    incremental over exact 0.10 experiment-01 contents (regardless of user commit hash).

12. R07 native host preparation, revision 0.12: `Clutter R07 Native Mac Harness 03.patch`,
    incremental over exact 0.11 experiment-02 contents. Apply 02 before this patch.

Each update is incremental over its predecessor's file contents, not a particular
user-created commit hash. If this file is present at revision 0.12, do not blindly
reapply those patches. Inspect actual files and git state; do not use reset/clean,
force checkout or re-create the branch to hide divergence.

## Read order

1. [Roadmap](roadmap.md), then [R01 inventory](current-capability-inventory.md) and
   its [executed evidence](evidence/r01-2026-11-14.json).
2. [R02 interaction specification](editor-interaction-spec.md),
   [case catalogue](editor-interaction-cases.json) and policy ledger Q-01–Q-09.
3. [R03 document model](document-model-spec.md), [command API](command-api-spec.md)
   and [operation/scenario catalogue](model-api-contract-cases.json), including M-01–M-07.
4. [R04 persistence](vault-persistence-spec.md) and [failure catalogue](persistence-contract-cases.json),
   including PS-01–PS-07.
5. [R05 protocol](provider-sync-spec.md), [provider feasibility](provider-feasibility.md)
   and [SC catalogue](provider-sync-cases.json), including SY-01–SY-08.
6. [R06 editor qualification](editor-qualification-plan.md), [instances](editor-qualification-instances.json),
   [platform](platform-boundaries-spec.md), [security](local-security-api-spec.md),
   [budgets](qualification-budgets.json), [HQ cases](host-security-cases.json) and
   [readiness](qualification-readiness.md).
7. [R07 experiment](experiments/r07-two-view/README.md), [findings](experiments/r07-two-view/findings.md)
   and [first evidence](evidence/r07-2026-11-14.json), then
   [second findings](experiments/r07-two-view/follow-up-findings.md) and
   [second evidence](evidence/r07-02-2026-11-14.json). Keep candidate configurations distinct.
   Then read [Mac run guide](experiments/r07-two-view/native-macos/README.md) and
   [native preparation evidence](evidence/r07-03-2026-11-14.json).
8. [Product contracts](product-contracts.md) and [behaviour](product-behaviour.md).
9. [System architecture](system-architecture.md) and [shared API](shared-api.md).
10. [Sync/platform](sync-and-portability.md) and [history](history-and-collaboration.md).
11. [Decision register](decision-register.md), [ADRs](adr/README.md),
    [acceptance matrix](acceptance-matrix.md) and [qualification plan](qualification-spike.md).
12. [Delivery discipline](delivery-plan.md), current repository guidance and relevant
    source/tests. Old production rules remain binding until explicitly superseded.

## Guardrails for resuming

- The user explicitly permits replacing 100% of the existing implementation.
  Current Markdown interactions are not a complete
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
- Current authorized continuation includes the isolated R07 experiment, not a
  production rebuild. Preserve unqualified tests and report blocking observations.

## Exact next action: first Mac build and native observations

The user has a Mac; this environment is Linux. Deliver/apply the native patch after
02, then the user runs the commands in the Mac guide. The source has not been
compiled against AppKit/WebKit here. Do not claim the packaged app works until the
real build/launch result is available. Tool/helper tests and plist parsing are
separate evidence. No tool installation or remote login is automatic.

The runner builds a separate local .app, starts fixed loopback assets, presents
native case controls and saves JSON reports automatically. Ask the user to follow
the eight bounded manual cases for keyboard, IME, native Edit menu, clipboard,
VoiceOver and focus, marking pass/fail/blocked. Automated fixture checks never set
manual verdicts. A/B within one candidate share content; candidate windows do not.
Website data is ephemeral, not native durable storage. Keep synthetic content only.

When the user shares a report, inspect build/source/OS identity, manual attempts,
raw versus adapted control scope, fixture failures, capture errors and not-run/
blocked cases. Any observed failure remains relevant even after a passing retry.
If compilation/setup fails, fix it from the setup JSON and actual compiler error;
do not reinterpret blocked native work as passed. Broader structural history,
task lifecycle, headless API/durability and provider gaps remain independent gates.
Do not choose a stack or start production from the count of Linux checks passing.

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
