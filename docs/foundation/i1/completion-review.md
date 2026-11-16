# Scoped I1 completion review

Revision0.55, 2026-11-16. I1's disposable integration milestone is complete for the
recorded profile. This is neither production baseline adoption nor real-vault or
shipping authorization. [Evidence](../evidence/i1-native-completion-31-2026-11-16/review.json).

| I1 definition of done | Disposition and evidence |
| --- | --- |
| One semantic implementation | Same PageOperations/SpaceService catalogue for UI/CLI/MCP; media ingress replays exact requests, not a second reducer. I1a/editor/media/native automated evidence |
| Enforced graph | Portable contracts/Core/client; explicit Vault/engine composition. Actual browser bundle excludes Node/fs/SQL and Node bundle excludes old Store; automated import checks |
| One running writer per Space | Disposable same-path exclusive SQLite writer and private bootstrap tested; installed alias/fencing/auth remains G-Q |
| Per-page editor binding | Actual EditorViews, context history/protection and two-view remount; 80 automated runtime cases after30; NC28-01 user-confirmed after two observed issues fixed |
| Commit/retry/recovery | Expected-head/outcome/unknown-result/editor/media tests;03 journal close/reopen/retry and04 text protection/recovery/restart user-confirmed. Supplied app-closed CLI read returns PROTECTED at sequence38 |
| Honest scope | Factory-created marked temporary Spaces only, no old/app/user-vault path; schema3/codec experimental; no production migration or full durability claim |

NC28-01…04 pass from guided user observations. The CLI JSON is supplied directly;
raw native manual reports are NOT inspected. Screenshot before Recover protected A
was clicked is not evidence of recovery loss. Original failed compiler/interaction
attempts remain diagnostic.31 changes documents/evidence only: prior80 tests/TS and84
old regressions are referenced, not represented as newly executed runs.

## Next bounded work

Prepare the production host/runtime qualification contract under existing G-Q.
Define comparable complete host/runtime candidates and shared Core/CLI/MCP lifecycle,
installed app-closed startup/discovery, peer grants, canonical Space identity/alias
fencing, runtime distribution/signing/updates, native file+SQL durability ports and
Windows extension boundaries. Establish D11 reference machine/workload/metric targets
BEFORE performance runs. Keep policies/semantic reducers in the single TS Core;
Rust, if selected for native ports, is not another task/property/history engine.

First deliverable is this bounded contract with hard exit criteria, not another
open-ended editor research round or a new unqualified launcher. Measure candidates
against the same contract before accepting the production shell/runtime. Do not
silently equate this Swift/WK/pinned Node qualification host with a shipping choice.
No additional manual replay of NC28 is requested just to record this milestone.

Before real data, final schema/codec/retention/history/pins/backups/export/migration/
rollback and current-rule/ADR impact still need their established gates. Broader task
page, properties, templates, calendar/recurrence, full editor/accessibility and provider
features retain their product contracts; none are removed by this slice's small UI.

## H01 contract32 checkpoint — 2026-11-16

User confirms31 applied. Host/runtime contract is now in runtime-qualification/
contract.json and README.md (relative foundation root). Do not rewrite it or replay
NC28. Next safe host inventory JSON from user Mac, then bind candidate/version/host/
instruments before builds/timing. All H01 comparisons not-run. Single TS Core and
common independent Node owner; Tauri/Electron shortlist, Swift/WK control.32 does not
select shipping runtime or waive real-data/full-workload gates. START-HERE is current.
