# Resume Clutter foundation work

Last updated: 2026-11-14. Documentation revision: 0.37.
Read AGENTS.md and this file first in a new chat or agent session. It is the checkpoint, not a
second product specification. [README](README.md) identifies authoritative docs.

## Current position

Product scope is recorded; architecture is not finalized and production work has
not started. This checkpoint supersedes earlier next-action text in historical
records. Keep one branch, `architecture/clutter-foundation`, and preserve all work.

| Area | Latest verified status |
| --- | --- |
| R01 | Bounded capability audit complete; 45 entries and selected existing-test evidence |
| R02–R06 | Conditional interaction/model/API/persistence/provider/security drafts; explicit open policy/encoding/release gates, not complete implementation acceptance |
| R07 history (build12) | Unchanged matched strict contract: 24 passes/6 explicit protective refusals, no gaps/failures; context-owned history and mapped guards |
| R07 durability (build13) | 18 bounded Linux cases pass in a separate real SQLite owner/browser-projection/CLI/MCP fixture; full editor/native integration remains open |
| Regressions in13 | 84 Node checks pass; unchanged strict comparison green, including 12 earlier live command cases |
| Native/manual | Earlier09 confirmed passes/raw reports preserved; no12/13 Mac claim, IME unavailable, VoiceOver deferred; no broad rerun needed |
| Next | R08 architecture review package: proposed complete combinations/ADRs, remaining gates and minimal joined core/native proof |
| Git | User reports patch12 applied;13 prepared over exact12. No agent commit/push, production, Swift, dependency lock or branch change |

Read [durable qualification](r07-durable-authority.md), [history qualification](r07-history-ownership.md)
and [native progress](NATIVE-TEST-PROGRESS.md). Separate executed evidence from
proposed policy and open qualification. No stack/provider is accepted.

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

13. Native compiler correction, revision 0.13: `Clutter R07 Mac Compiler Fix 04.patch`,
    incremental over exact 0.12/patch-03 contents. User reports 03 committed as cdafd1c7.

14. Confirmed table interactions/progress, revision 0.14: `Clutter R07 Table Interaction Update 05.patch`,
    incremental over exact 0.13/patch-04 contents. Quit the old native host before rebuilding.
15. Preserve original table focus, revision 0.15: `Clutter R07 Preserve Table Focus 06.patch`,
    based on exact 05 contents.
16. Selected-cell/editing modes, revision 0.16: `Clutter R07 Table Selection Modes 07.patch`,
    based on exact 06 contents.
17. Native progress checkpoint, revision 0.17: `Clutter R07 Native Progress 08.patch`,
    documentation only over exact 07 contents; no lab rebuild required.
18. Triple-click fix and accumulated native progress, revision 0.27: `Clutter R07 Triple Click Fix 09.zip`.
    Includes verified alternative patches for exact 07 or 08; apply helper selects by preflight.
    Do not apply both alternatives. Rebuild native:mac after the fix.
19. Native results and qualification handoff, revision 0.34: `Clutter R07 Native Qualification Handoff 10.patch`,
    documentation/evidence only over exact bundle09 target; no native rebuild.
20. Matched automated history/command comparison, revision 0.35: `Clutter R07 Matched Comparison 11.zip`,
    verified alternatives over exact09 or exact10. No new manual test/rebuild requested.
21. Context-owned history fixes, revision 0.36: `Clutter R07 Context History Fix 12.patch`,
    incremental over exact bundle11 target; native 12 smoke remains unrun.

Each update is incremental over its predecessor's file contents, not a particular
user-created commit hash. If this file is present at revision 0.17, do not blindly
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

## Exact next action: R08 architecture decision review package

Read [durable-owner proof](r07-durable-authority.md), its
[evidence](evidence/r07-29-2026-11-14.json), and [context history](r07-history-ownership.md).
Build 13 adds a separate P-SQL durable-owner fixture: 18/18 Linux cases pass for
atomic revision/outcome, real process death, lost replies, exclusive ownership,
provisional recovery, tiny in-DB attachment closure and pinned historical content.
Browser projections, real CLI and MCP share that owner. It does not yet join the
full PM/Y editor/history engines to the durable owner or qualify native storage.
84 Node regressions pass; unchanged matched strict gate remains 24 pass/6 explicit
protective refusals, no gaps/failures. Original controls/manual evidence remain.

Next prepare a concrete architecture review: compare complete combinations,
propose candidate choices and superseding ADRs, list rejected alternatives and
remaining now/later gates. Specify the minimal joined editor-to-durable-core and
native qualification slice before final acceptance. Resolve material R02–R06
policy/model/security/performance gaps in that review; do not quietly mark them
passed. No production implementation, provider enablement or accepted backend/
editor/framework follows from the current results.

Patch13 (`Clutter R07 Durable Authority Proof 13.patch`) applies over exact12;
user reports12 applied. SQLite is the first experimental backend, not a decision.
No dependency/lock, Swift, production, agent commit/push or branch change. No new
manual session rerun requested. Mac12/13 not run, IME unavailable, VoiceOver deferred;
earlier Mac09/manual passes remain valid. Keep all old raw evidence unchanged.

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
