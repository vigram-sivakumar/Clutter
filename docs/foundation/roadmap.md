# Foundation roadmap

Revision 0.4, 2026-11-14. This roadmap describes work and dependencies; the current
checkpoint/authorization is in [START-HERE](START-HERE.md). Product scope is in
product-contracts.md, not independently redefined here.

## Progress and next deliverables

| ID  | State                                            | Work and output                                                                                                                                               | Depends on                | Exit evidence                                                                                                                                                                      |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R00 | Documentation prepared                           | Foundation pack 0.1–0.4: confirmed scope, ownership/API proposals, ADRs, initial test/spike specifications and resumable handoff                              | User clarification        | Prior 0.1–0.3 remote commits confirmed at f22a5cd; 0.4 delivery pending user application                                                                                           |
| R01 | Complete — 2026-11-14                            | [Inventory](current-capability-inventory.md): 45 source/wiring capability entries with target mapping                                                         | R00                       | [Selected run](evidence/r01-2026-11-14.json): 30 files/1,003 assertions passed across initial/targeted runs; initial load errors/setup corrections and static/target gaps explicit |
| R02 | Next                                             | `editor-interaction-spec.md`: observable keyboard/selection/clipboard/IME/focus/undo matrix                                                                   | R01                       | Precise expected outcomes and native fixtures for T-01/T-03, including tables/media/read-only embeds                                                                               |
| R03 | Planned                                          | `document-model-spec.md` and `command-api-spec.md`: typed schema, IDs, task placement/copy/move, comments/version closure, versioned command/query signatures | R01; consume R02          | One owner per fact/rule, API parity/preconditions, edge cases and migration/refusal rules                                                                                          |
| R04 | Planned                                          | `vault-persistence-spec.md`: candidate transaction boundaries, history/pins/recovery/media lifecycle, outcome/durability and future snapshot contract         | R03 draft                 | Failure states and cleanup roots explicit; no chosen backend treated as proven                                                                                                     |
| R05 | Planned                                          | `provider-sync-spec.md`: local/outbox lifecycle, packages, ordering/tombstones, task consistency and separate provider feasibility                            | R03/R04 drafts            | No active DB replication, retained overwritten states, restart/disable/credential semantics and measurable provider gates                                                          |
| R06 | Planned                                          | Close qualification fixtures/budgets, `platform-boundaries-spec.md` and local security/IPC detail; update acceptance/spike docs                               | R02–R05 drafts            | Reproducible candidate configs, performance limits, portable boundaries and no missing critical contracts in spike scope                                                           |
| R07 | Planned; not executed                            | Isolated local/native qualification, deterministic provider simulation, then real-provider experiments                                                        | R06                       | Relevant T-01–T-21 pass/fail/blocked with logs; native and each provider qualified separately                                                                                      |
| R08 | Planned                                          | Architecture baseline review and accepted/superseding ADRs                                                                                                    | R07 for related scope     | Compare complete combinations; resolve blockers; identify every affected existing rule before production changes                                                                   |
| R09 | Planned; production work requires explicit scope | Implement one production vertical slice across app/CLI/MCP, two views, task identity, persistence/history/recovery                                            | R08                       | Contract tests, native input, failures and code review demonstrate agreed behaviour                                                                                                |
| R10 | Planned                                          | Expand initial feature coverage, detailed UI specs and release qualification; enable only qualified opt-in providers                                          | R09                       | Declared release matrix passes; no untested provider/Windows support claims                                                                                                        |
| R11 | Deferred                                         | Live cloud collaboration/page-sharing roles and automatic backup feature as separately scoped increments                                                      | New product/service phase | T-22/T-23 and new security/hosting contracts before enabling; not initial blockers                                                                                                 |

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
projection freshness risk remain visible. R02 is next; production work is still gated.
