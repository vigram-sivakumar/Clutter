# Foundation roadmap

Revision 0.12, 2026-11-14. This roadmap describes work and dependencies; the current
checkpoint/authorization is in [START-HERE](START-HERE.md). Product scope is in
product-contracts.md, not independently redefined here.

## Progress and next deliverables

| ID  | State                                                         | Work and output                                                                                                                                                                                                          | Depends on                | Exit evidence                                                                                                                                                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R00 | Documentation prepared                                        | Foundation pack 0.1–0.12: confirmed scope, ownership/API proposals, ADRs, initial test/spike specifications and resumable handoff                                                                                        | User clarification        | Remote 0.9 user commit verified at 1215044; R07 prepared, no agent commit/push                                                                                                     |
| R01 | Complete — 2026-11-14                                         | [Inventory](current-capability-inventory.md): 45 source/wiring capability entries with target mapping                                                                                                                    | R00                       | [Selected run](evidence/r01-2026-11-14.json): 30 files/1,003 assertions passed across initial/targeted runs; initial load errors/setup corrections and static/target gaps explicit |
| R02 | Draft prepared; policy review open                            | [R02](editor-interaction-spec.md) and [case catalogue](editor-interaction-cases.json): 72 shared/profile seed contracts, not execution                                                                                   | R01                       | 60 shared requirements/12 profile proposals specified; Q-01–Q-09 and variation expansion remain before acceptance                                                                  |
| R03 | Conditional drafts prepared; review open                      | [Model](document-model-spec.md), [API](command-api-spec.md) and [registry/scenarios](model-api-contract-cases.json): semantic identity, placement, closure and logical signatures                                        | R01; consume R02          | DM-01–DM-15, 51 operation sketches and 24 unexecuted scenarios; M-01–M-07/Q-01–Q-09 and full wire/encoding qualification remain                                                    |
| R04 | Conditional draft prepared; qualification open                | [Persistence spec](vault-persistence-spec.md) and [PF catalogue](persistence-contract-cases.json): backend commit/ack, roots, history/recovery/outbox and failure contracts                                              | R03 draft                 | P-SQL/P-ROOT/P-TEXT compared; 30 unexecuted fault cases and PS-01–PS-07 open; no backend/native proof                                                                              |
| R05 | Conditional draft prepared; qualification open                | [Protocol](provider-sync-spec.md), [feasibility](provider-feasibility.md) and [SC cases](provider-sync-cases.json): lifecycle, packages, ordering and ownership gates                                                    | R03/R04 drafts            | 30 unexecuted scenarios; SY-01–SY-08 open, SY-04 ownership blocker; official sources reviewed, no real-provider proof                                                              |
| R06 | Conditional drafts prepared; experiment setup open            | [Editor qualification](editor-qualification-plan.md), [platform](platform-boundaries-spec.md), [security](local-security-api-spec.md), [budgets](qualification-budgets.json) and [readiness](qualification-readiness.md) | R02–R05 drafts            | 102 seed/timing instances + 16 probes, 18 HQ scenarios, all not-run; candidate locks/native environment and relevant policy decisions still required                               |
| R07 | Two scoped slices executed; Mac host prepared, native pending | [Isolated experiment](experiments/r07-two-view/README.md) and [Mac guide](experiments/r07-two-view/native-macos/README.md); native build/input and provider work remain                                                  | R06                       | Latest: 38 Node checks, 21 selection + 11 origin browser passes; adapted control passes/raw control fails; native/full parity unqualified                                          |
| R08 | Planned                                                       | Architecture baseline review and accepted/superseding ADRs                                                                                                                                                               | R07 for related scope     | Compare complete combinations; resolve blockers; identify every affected existing rule before production changes                                                                   |
| R09 | Planned; production work requires explicit scope              | Implement one production vertical slice across app/CLI/MCP, two views, task identity, persistence/history/recovery                                                                                                       | R08                       | Contract tests, native input, failures and code review demonstrate agreed behaviour                                                                                                |
| R10 | Planned                                                       | Expand initial feature coverage, detailed UI specs and release qualification; enable only qualified opt-in providers                                                                                                     | R09                       | Declared release matrix passes; no untested provider/Windows support claims                                                                                                        |
| R11 | Deferred                                                      | Live cloud collaboration/page-sharing roles and automatic backup feature as separately scoped increments                                                                                                                 | New product/service phase | T-22/T-23 and new security/hosting contracts before enabling; not initial blockers                                                                                                 |

R00 means the documents were prepared, not that G0 inventory or architecture
qualification is complete. R03–R06 produce reviewable proposals; experiments may
require their revision. Do not write an immutable complete spec and disregard
contradicting runtime evidence. Work on independent specification details may
overlap, but dependent technical choices remain gated.

## R01 review package and R02 input

The [inventory](current-capability-inventory.md) now records the capability map, conflicts between old docs and live source, known
coverage gaps, proposed ownership mapping and remaining decisions that actually
affect R02/R03. Avoid a new broad questionnaire. Resolve routine details from
confirmed contracts; ask one focused question only for a material product gap.

## Definition of ready for qualification

Fixtures have exact expected results; schema/commands and persistence outcomes
are explicit; candidate versions are pinned; histories/assets/undo have owners;
performance budgets and failure points are named. macOS test availability is known,
with blocked native results reported honestly. Provider transport tests cannot
substitute for native editor tests or vice versa.

## Definition of ready for production

Related acceptance contracts have evidence; core correctness blockers are resolved;
ADRs state accepted choices/trade-offs and replacement of existing rules; scoped
UI/error states and command signatures are reviewable. Clean up/reject experimental
alternatives explicitly; do not wire competing implementations into production.

## Maintenance

Use Planned / Next / In progress / Blocked / Complete / Deferred with evidence
links and dates. A completed draft is not a qualified capability. Keep the exact
next task in START-HERE aligned with this table. This is a dependency roadmap,
not invented calendar estimates or a commitment to every proposed filename.

R01 completion means the bounded inventory was delivered, not a passing full-suite
or native acceptance result. Initial load failures/resolved setup and source-level task
projection freshness risk remain visible. R02 draft is prepared with policy review open. R03 conditional schema/API drafts
are prepared. R04 persistence/history/outcome/outbox draft is prepared. R05 provider draft is prepared. R06 preparation is drafted. R07 first slice ran; native/broader semantic qualification preparation
is next; preserve
M-01–M-07 and Q-01–Q-09 rather than choosing defaults silently. Production work
is still gated.

The user's latest clarification explicitly rejects treating current Markdown
interactions as the target for every candidate. R02 profiles keep that distinction
visible. R02 approval and R07 execution are different gates; the drafted catalogue
is not proof that an engine passes, and exploratory profile comparison is allowed.

R03 completion here is draft preparation, not implementation readiness or accepted
canonical encoding. The operation catalogue is a logical signature registry, not
a working API. Qualify retries, failure atomicity and reconstructable history in
R04/R07 before accepting a storage baseline or publishing adapter contracts.

R04 is specification preparation, not fault-injection execution or a selected
backend. R05 proposes provider ordering/tombstone/baseline rules and preserves SY-04 coherence as a blocker;
its files must not be interpreted as an active shared SQLite database. Actual native
and provider support remain R07 evidence gates after detailed contracts/budgets.

R06 supplied proposed budgets and concrete scenario expansion, not a ready locked
candidate or native execution. [Readiness](qualification-readiness.md) identifies
entry conditions for scoped exploration versus binding acceptance. The current
implementation may be replaced completely; no engine or framework is mandatory.

R07's first slice is exploratory evidence, not completion of R07. The raw history
candidate fails nested-origin undo, and immediate final-cell Tab fails both the
two-view integration and raw control. [Findings](experiments/r07-two-view/findings.md)
are release/selection blockers; a green core diagnostic is not acceptance.

Second-slice [findings](experiments/r07-two-view/follow-up-findings.md) and
[evidence](evidence/r07-02-2026-11-14.json) demonstrate targeted alternatives; they
do not repair or accept the raw composition. Preserve controls and compare complete
capabilities, native behaviour and costs before R08. No provider CRDT merge or
production persistence decision is implied by local origin-aware history tests.

A separate native host/checklist/report runner is prepared in revision 0.12. The
Swift/AppKit build and all native cases remain unexecuted on this Linux host. User
Mac execution is the next evidence step; [preparation evidence](evidence/r07-03-2026-11-14.json)
records helper/regression checks without treating them as native acceptance.
