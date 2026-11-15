# Architecture gap disposition

Revision 0.38, 2026-11-14. Proposed review dispositions, **not resolved policy or
passing tests**. Read the [review gates](architecture-review.md). Source ledgers
own the detailed questions; this table only assigns the required stage and next
proposal. Do not interpret a deferred implementation as removal from product scope.

- **J / G-J:** fix the joined synthetic codec/commit/session contract before coding;
  run JG-01–JG-10 before declaring the integrated core qualified.
- **Q / G-Q:** settle required decisions and qualify ownership/schema/platform/
  representative budgets before accepting the related production baseline.
- **F / G-F:** detailed feature acceptance before that feature ships; architecture
  must already reserve its ownership/transaction/decoder seams at Q.
- **P / G-P:** optional provider enablement; disabled until its own gates pass.
- **Later:** explicit deferred product phase, with stable extension boundaries now.

## Interaction ledger — Q-01–Q-09

| Source ID | Proposed disposition and action                                                                                                                                          | Gate                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Q-01      | Structured block splitting/joining must preserve IDs/outside content; freeze chosen schema/selection rules, no Markdown-key equivalence assumption                       | Q structural model; F complete EI matrix                    |
| Q-02      | Task-title edits never implicitly delete body; propose no destructive empty-title demotion. Enter/new-task and body insertion remain explicit UX decisions               | Q before task keymap/model; F task interactions             |
| Q-03      | Declare focus/indent policy by paragraph/list/code context; prove escape routes without changing confirmed table modes                                                   | Q focus contract; F complete keyboard/accessibility         |
| Q-04      | Table navigation, handles, focus preservation and triple-click are confirmed; merged cells/range commands/menus are not implicitly included                              | J preserve confirmed behavior; Q schema; F broader table UX |
| Q-05      | Cut is an identity-preserving staged move until commit; failed/expired clipboard cannot delete source. Freeze cross-note undo and cross-Space support before exposing it | Q + JG-12; F clipboard/native variants                      |
| Q-06      | Completion generates at most one next occurrence; undo must not erase independent next-task edits. Specify refusal/narrowing and redo identity                           | Q scheduler/inverse contract; F recurrence                  |
| Q-07      | Remote winning snapshot protects pending input, uses explicit safe rebase/history boundary and retains overwritten versions                                              | Q architectural seam; P execution                           |
| Q-08      | Failed-save normal close protects or stays open; no implicit discard exception. Explicit discard remains unapproved, not a feature to add                                | J lifecycle, Q policy; F destructive UX if later approved   |
| Q-09      | Choose reversible source-looking shortcuts/literal escape per structured profile; source mode is not an assumed requirement                                              | Q input rules design; F shortcuts                           |

## Model ledger — M-01–M-07

| Source ID | Proposed disposition and action                                                                                                                                                      | Gate                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| M-01      | No subtasks. Propose disallowing task insertion into a task page body in the first release until an independent-placement model/UX is approved                                       | Q before task schema; F if enabled            |
| M-02      | Freeze owned-ID copy remapping and atomic same-Space moves; cross-Space unsupported cases must be explicit, preserve source and never create forbidden task references               | Q + JG-12; F conversions/clipboard            |
| M-03      | Define typed property codec, empties/conversions/collisions and namespaced standard fields; no global custom-schema propagation or collection-field expansion                        | Q codec; F property UX                        |
| M-04      | Historical task restore must plan/recheck current placement; propose explicit conflict/refusal instead of silently duplicating/relocating task ownership                             | Q + JG-12; F complete restore UX              |
| M-05      | Freeze recurrence identity, reopen/edit/copy-series rules, next placement, timezone/reminder behavior; unchanged original schedule/skip-missed policy remains confirmed              | Q scheduler contract; F recurrence            |
| M-06      | J uses one versioned accepted Y payload, no writable PM/Markdown mirror. Production task/property/placement representation and atomic multi-entity roots still require closure proof | J codec + Q/JG-12/13; P remote reconciliation |
| M-07      | Define daily-note calendar identity/uniqueness across timezone changes independently of file paths; propose explicit Space calendar-zone policy for review                           | Q before daily-note schema; F date UX         |

## Persistence ledger — PS-01–PS-07

| Source ID | Proposed disposition and action                                                                                                                                                      | Gate                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| PS-01     | Freeze commit/flush/ack and pending protection cadence for each actual OS profile; J reuses WAL/FULL/exclusive test profile without extending its durability claim                   | J; Q actual Mac profile/budgets                  |
| PS-02     | Prove staged Y-root/SQL outcome atomicity; choose exact entity codec/constraints and external asset-before-reference protocol                                                        | J + Q/JG-12/13                                   |
| PS-03     | J retains all operation receipts and rejects changed reuse. Production bounds/retirement/fencing cannot expire deduplication silently                                                | J stable identity; Q bounded retention/election  |
| PS-04     | Preserve pins/history/reachable assets; no GC in J. Choose history cadence/retention/unpin/lease policy and representative storage budget before production retention implementation | Q design/budgets; F GC/fault qualification       |
| PS-05     | J covers full-editor pending recovery and owner restart; corrupted latest state fails closed. Native degraded recovery/export and takeover need actual profile evidence              | J; Q native profile; F recovery UX               |
| PS-06     | Reserve coherent snapshot leases/versioned decoders. Choose migration/rollback and historical readability before first production format                                             | Q format policy; F migration/export faults       |
| PS-07     | Keep publication/ingestion as atomic root/outcome consumers; no hidden outbound queue or mandatory provider work in local-only save                                                  | Q interface; P outbox/cursor/coherence execution |

## Host and security ledgers

| Source ID | Proposed disposition and action                                                                                                                     | Gate                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| PL-01     | Lead: per-Space packaged TS/JS owner independent of app UI; runtime binding/shell remain unaccepted pending installed launch/footprint proof        | J real owner; Q/G-N installed topology                           |
| PL-02     | No timeout/PID takeover; qualify alias identity and resumed stale-writer exclusion, not merely one path's SQLite lock                               | Q/G-N                                                            |
| PL-03     | Freeze versioned wire envelope, outcome/error/cancellation and bounded frame contract; exact CLI/MCP adapters consume one schema                    | J; Q production framing/discovery                                |
| PL-04     | Pending input/context history mapping/reconnect protection is the central joined gap, not solved by separate editor and SQL passes                  | JG-01–10 + G-N                                                   |
| PL-05     | Choose actual macOS distribution/sandbox/grant strategy; portable module graph/path contracts now, Windows native packaging later                   | Q/G-N; Windows later                                             |
| SEC-01    | Private endpoint/authenticated peer discovery; test substituted descriptors/old generations. Test-parent bearer setup is insufficient               | Q/G-N                                                            |
| SEC-02    | Scope grants to Space/capabilities/context; forged origins cannot authorize edits. Prove revoke/admit/subscription races and app-closed automation  | J trust boundary; Q production grants                            |
| SEC-03    | Pin decoder bounds/CSP/media staging/renderer protocols. Do not enable arbitrary embeds or trust binary Y updates to satisfy semantic authorization | J rejection cases; Q bounds/media boundary; F adversarial corpus |
| SEC-04    | Pin protocol/version and fair resource limits; unknown response retains op identity. MCP test subset is not full production conformance             | J; Q protocol/limits; F full adapter matrix                      |

## Provider ledger — SY-01–SY-08

All provider features remain disabled/unqualified; local-only architecture must
retain the seams below now. No source scenario is marked complete by DO/JG tests.

| Source ID | Proposed disposition                                                                                                                     | Gate                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| SY-01     | Explicit opt-in/binding/rebind; exact multi-provider policy before settings promise support                                              | P                                                  |
| SY-02     | Versioned coherent package codec, completeness/resource bounds and discovery; never transfer live DB/WAL as sync                         | Q codec extension seam; P concrete packages        |
| SY-03     | Deterministic causal winner definition and replica incarnation; engine-local CRDT merge must not silently replace latest-document policy | P                                                  |
| SY-04     | Coherent task/series/delete reconciliation across documents; latest individual note cannot duplicate task placement                      | Q identity/transaction closure; P remote algorithm |
| SY-05     | Tombstone/replica retirement and trusted rejoin; no arbitrary timeout-based deletion                                                     | Q retention extension seam; P concrete membership  |
| SY-06     | Declare history/pin/media publication/download/root retention scope                                                                      | Q root manifests; P provider scope                 |
| SY-07     | Actual signed iCloud/Drive route, grants/placeholders/Windows feasibility                                                                | P real-provider evidence                           |
| SY-08     | Headless lifetime/retry/poll/status budgets with no implied background service after all processes exit                                  | Q lifecycle seam; P concrete sync runtime          |

## Scope and priority boundaries

Images/PDFs, task pages/properties, version pins and CLI/MCP remain initial product
requirements. J's tiny in-DB bytes, embedded task and partial tools are fixtures,
not scope substitutions. Live multi-person cloud collaboration and automatic
backup scheduling remain Later. Optional provider support requires G-P even if a
local baseline is accepted first. VoiceOver is deferred by user priority and IME
is unavailable in the reported environment; neither is recorded as passed. Preserve
accessibility/input architecture now and explicitly review the native release
matrix rather than declaring blanket native acceptance from earlier manual passes.

D-11 remains open: proposed workload/budget numbers must be fixed for the reference
host before measurement and met (or explicitly revised with reason) before G-Q;
no memory/performance evidence is supplied by this review. Product proposals above
are not user decisions. Resolve only material UX gaps one example at a time when
needed for the corresponding implementation, without reopening settled contracts.

## Execution update — revision0.45

[Entity proof21](r08-entity-closure.md) supplies14 bounded cases for M02/M04/M06
and PS02's proposed multi-note root closure: canonical independent tasks, derived
unique placement, conservative note restore, process-death atomicity and shared
command ingress. It does not settle complete clipboard/move undo, task restore UX,
production partitioning/performance or external assets. JG13/PS02/PS04 attachment
publication/retained-file closure remains open. Keep ledger dispositions/proposed
policies and original frozen JG contract separate from executed evidence.
