# Resume Clutter foundation work

Last updated: 2026-11-15. Documentation revision: 0.45, build21.
Read [AGENTS](AGENTS.md), this checkpoint and [README](README.md) first.

## Current position

Architecture qualification continues on **architecture/clutter-foundation**.
No production rebuild, accepted stack or provider implementation. Product decisions
remain in product-contracts.md; historical progress is in CHANGELOG.md/roadmap.md.
This current checkpoint supersedes earlier next-action text in historical records.

| Area | Verified status |
| --- | --- |
| Product/model/editor/contracts | Confirmed scope plus explicitly conditional technical specifications; full feature/release matrix remains open |
| R07 history build12 | Frozen matched strict contract:24 passes/6 protective refusals, no gaps/failures; preserved raw controls |
| R07 durability build13 |18 bounded Linux cases; separate real SQLite owner and CLI/MCP |
| Joined build15 | JG-01–10 pass with actual PM/Y views, one accepted Y root and shared durable owner |
| Native build20 | User reports JN-01–04 pass, including failed-close protection/reopen, restart and app-closed same-Space CLI read; no replay needed |
| Native report reviewed | evidence/r08-native-manual-2026-11-15/review.json: actual build20 Mac arm64/Node24.22.1/SQLite3.53.4; raw JN01/02, HN01/02 and synced final PROTECTED root; later checks are user reports |
| Native limits | IME unavailable; VoiceOver deferred; distribution/security/full release matrix and explicit native reload-safety trial unqualified |
| Entity build21 |14 Linux cases pass for proposed canonical task page/unique placement, atomic multi-note move, historical read/restore conflict,6 real process-death phases, CLI/MCP parity and stored Y closure |
| Next | JG-13 external PNG/PDF file publication and retained historical root closure |

## Branch and delivery state

Remote foundation17d63b3 contains exact build20 (verified tree
f8e3b85c383bd656eb1b5e25df3035a98205e073). Build21 is an incremental patch over20;
application/commit is not assumed until user confirms. This workspace holds later
uncommitted foundation changes; no agent commit or push. Initial source provenance
was main cae604273115c0c6c0d3ac34533b1e9834e9c778; do not reset to it.

The user's local main accidentally committed generated outputs during unrelated
app work. A guarded utility repaired its five unpublished app commits, preserving
legitimate content/metadata and adding narrow root ignores. User reported repaired
main c3bb1d6d97dd5547a888f2b49ff881fb0b0be34e and a backup. Push success is unreported.
Remote main568dd8e was independently verified free of foundation paths before repair.
This is repository hygiene, not a foundation merge or architecture decision.

Do not switch/merge/rebase main or push backup refs while resuming foundation.
Every apply helper must guard this branch. Keep outputs under ignored directories,
use explicit foundation staging, and inspect staged paths before user commits.
Never stage app bundles, runtime archives, caches, artifacts/ or local test stores.
Never remove the user's saved native sessions or repair backup.

## Exact next work

1. Read [entity result](r08-entity-closure.md), entity CONTRACT.md and
   [gap ledger](architecture-gap-disposition.md), then JG-13 in the frozen
   joined-core-contract.json. Do not rewrite frozen not-run fields: evidence is separate.
2. Freeze an external-asset protocol before code: valid PNG/PDF inputs, hash/size/
   decoder bounds, immutable file names, stage/flush/publish/directory-flush before
   SQL reference commit, original operation receipts and crash reconciliation.
3. Extend the existing Store/host port, preserving earlier model profiles. Prove
   no acknowledged root can reference absent/partial bytes; old pinned roots keep
   their files after current-reference removal; orphan files stay unreachable and
   are not unsafely cleaned. No GC or cloud provider work.
4. Run bounded Linux faults/closure tests, record actual platform/flush limits,
   update checkpoint/roadmap/decisions/evidence and deliver the next incremental ZIP.
5. Review G-Q performance/runtime/security/format gaps before a baseline decision;
   G-M success alone does not qualify production or all product interactions.

## Entity interpretation and remaining limits

Build21 proposes task body/title/properties once in a task entity; note task_slot
blocks own at most one placement. Inbox means no note slot; placement index is
read-derived. One coarse Space Y root is a bounded closure proof, not a measured
production storage/partition choice. Restore note content only when task ownership
matches; it does not rewind independent task bodies. These conservative proof
policies remain proposals, not new user-approved restore UX. No native entity
binding, clipboard UI/cross-note undo, task-page restore, recurrence, delete or
migration acceptance. Entity IDs/paragraphs/task slots are a schema subset.

## Handoff discipline

Preserve manual passes even when picker clicks/captures are incomplete. Keep raw
reports immutable and separate user observations from captured execution. Do not
restart product discovery, replay native tests, enable provider sync or change
production based on these proofs. Keep ADRs Proposed until an explicit decision.
Update this checkpoint, roadmap and changelog together at meaningful handoffs.

New agent: continue JG-13 from this checkpoint on the single foundation branch;
inspect current Git state rather than assuming local paths or patch application.
