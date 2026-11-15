# Architecture decision review — R08

Revision0.48 update, 2026-11-15. **Recommended combination, not accepted production baseline.**
Current decision-readiness, module boundaries and exact next gate are owned by
[architecture-readiness](architecture-readiness.md). Product scope remains in
product-behaviour.md. This replaces the earlier0.38 next-experiment recommendation;
old proof/spec files keep their original statuses and source profiles.

## Recommendation after the joined/entity/media proofs

Advance direct **ProseMirror + Yjs**, a **shared TypeScript semantic core**, one
**headless Space authority**, **SQLite atomic commits** and **immutable external
assets**. Desktop, CLI and MCP are core interfaces over the same command catalogue
and handlers. Local origin/context history is the reason to use Yjs now; future
cloud collaboration is separately gated. Tiptap is neither required nor qualified
by direct-PM results. Existing editor/current-app compatibility has no decision weight.

Build15 executed JG01–10; native JN01–04 now have user-reported passes with reviewed
capture limits;21/22 execute bounded task/history/media closure. This is materially
stronger evidence than the separate proofs used in0.38. It is still not a complete
production binding, format, runtime or release result. Fresh browser regressions
in22 were environment-blocked, with retained headless alternatives and prior passes.

The remaining design change is **per-page engine roots in one Space transaction
system**. Aggregate21/22 roots are closure controls, not an accepted per-keystroke
Space serialization policy. [F008](adr/F008-page-roots-and-atomic-version-sets.md)
and frozen [PK01–10](page-partition-contract.json) now have [proof24](r08-page-closure.md)
headless results, including coherent historic task/media sets without copied bodies.
The review itself remains distinct from that runtime execution; no full production
format or editor/native binding is accepted.

## Complete alternatives and remaining host choice

| Combination | Disposition | Reason |
| --- | --- | --- |
| PM/Y + headless shared TS core + SQLite/external assets | Recommended mechanism combination | Strongest current integrated bounded evidence; partition/native/runtime/security/budgets still gated |
| PM step/context history + SQLite | Active fallback | Matched guarded contract passes with more protective refusals; full integrated alternative not executed |
| Text authority/CM6 + files/index | Reserve, not disproven | Must independently prove target structured task/page semantics and closure; legacy familiarity is not evidence |
| PM native immutable file roots/index | Reserve, not disproven | No complete executed equivalent of current joined/entity/external-file combination |
| Operation log/checkpoints and another engine/runtime | Reserve | Needs same semantic/history/retention/native gates; unmeasured size/speed claims do not choose it |
| Tauri/Rust native bridge + packaged JS owner | Candidate host topology | Swift/WK fixture does not prove Tauri sidecar/grants/update/distribution or footprint |
| Electron or another shell/embedded runtime | Eligible comparison | No measured rejection or acceptance; must keep the same core and headless semantics |

Current runtime pinning is reproducibility, not a claim of latest/safest dependency
versions or a final shipped binding. Node executable size observation is not RSS
or installer size. Read the readiness findings before choosing a host from it.

## Ownership and acceptance

Tasks are canonical first-class pages; their rendered note previews/All Tasks are
projections. Interactive undo, immutable versions/pins, pending recovery and layout
have distinct owners. One semantic mutation path coordinates staged page roots,
media-before-reference publication and original receipts. PM JSON/Markdown/search
indexes cannot become independently writable bodies. Shared core policy remains
portable; platform mechanisms enter through ports. Exact field/module ownership
is in the readiness review, not duplicated here.

G-J has bounded joined evidence. G-N has targeted native/user and installed fixture
evidence, not production distribution/security. G-M has aggregate task/media closure
but production partition/format is open. G-Q is unpassed: D11/reference workloads,
partition/version-set proof, native file flush, installed runtime/peer/grants,
format/migration and precise existing-rule supersession remain required for scope.
G-F is full feature release; G-P is optional provider enablement. Live collaboration
is later; it must not silently alter the confirmed latest-document provider policy.

Next: [scoped I1 entry](implementation-entry.md), then the disposable Core/API
implementation slice while the enumerated real-data G-Q blockers remain explicit. No production packages, main merge, provider feature or repeated Mac editor
session follows automatically. F006/F007/F008 stay Proposed. Existing rules below
are an impact inventory, not already superseded instructions.

## Existing rule impact

These are proposed future deltas, **not supersessions performed by this patch**.

| Existing rule / record                                                                                                                                                                                        | Proposed affected boundary; intent to preserve                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Architecture rules](../../ARCHITECTURE_RULES.md) §1/§2/§3/§5/§12/§13                                                                                                                                         | Replace concrete PageOperations/Gate/Vault/EffectivePageState wiring only after acceptance; keep one policy owner, one commit path and one effective projection                                  |
| Same rules §4/§6/§7/§8/§10/§11                                                                                                                                                                                | Preserve platform-only OS access, composition roots, downward dependencies, disposable derived data and centralized path semantics; names may change                                             |
| Same rules §9                                                                                                                                                                                                 | Preserve the prohibition on forwarding layers with no responsibility; audit any proposed package facade against it                                                                               |
| [ADR-001](../adr/001-single-persistence-gate.md), [002](../adr/002-capability-facades.md), [003](../adr/003-vault-authoritative-model.md), [010](../adr/010-retain-document-editing-engine.md)                | Concrete write/model/editor ownership changes require scoped successors; their current acceptance is untouched                                                                                   |
| [ADR-031](../adr/031-app-initiated-body-mutation-routing.md), [062](../adr/062-crash-recovery-snapshots.md), [063](../adr/063-atomic-vault-saves.md)                                                          | Shared semantic commands and transactional roots replace implementation-specific mutation/recovery/save mechanisms only after equal or stronger guarantees                                       |
| [ADR-073](../adr/073-multiple-windows-preferences-belong-to-clutter-navigation-belongs-to-windows.md)                                                                                                         | Preserve app settings vs window navigation distinction; per-webview document ownership is proposed to become shared Space authority/context leases; registry scope needs separate reconciliation |
| [ADR-036](../adr/036-frontmatter-properties-aliases-and-custom-keys.md), [058](../adr/058-properties-are-declared-by-frontmatter-keys.md), [071](../adr/071-cross-instance-note-moves-relocate-by-page-id.md) | Typed native properties, guarded checkout and identity-preserving task/note moves need explicit migration/semantic mapping; do not copy old file assumptions into the new native format          |

This is a reviewed starting impact inventory, not a claim that every existing ADR
has been exhaustively cleared. Before G-Q, inspect implementation call sites and
all affected records and list precise sections retained/superseded, migration
strategy and rollback scope in accepted successors. Foundation F001–F005 remain
Proposed; F006/F007 do not pre-accept their dependencies.

## Primary-source checks for the proposed integration

Checked 2026-11-14. [Yjs document updates](https://docs.yjs.dev/api/document-updates)
describes encoding state to updates and applying them. This supports a candidate
codec API, not proof of atomic Clutter commands or a product-safe CRDT merge.
[Tauri sidecars](https://v2.tauri.app/develop/sidecar/) documents bundled external
binaries; it does not prove app-closed ownership, signing, sandbox access or this
TS runtime topology. The ProseMirror public guide fetch was blocked (403); engine
behavior cited above is from the pinned executed source/tests, not a newly verified
upstream claim. Existing [durable evidence](evidence/r07-29-2026-11-14.json) records
SQLite runtime/profile and its original primary references.

## Joined follow-up, revision0.39

[Joined proof15](r08-joined-core.md) now passes JG-01–10 on Linux with real editor
views and an independent SQL owner, plus retained regressions. G-J is boundedly
qualified; no full stack accepted. Next JG-11 native/installed-headless candidate;
JG-12/13 model/external-asset and other G-Q gates remain. Frozen JG specification
not-run fields record its original state; execution evidence is separate.

## Native runner preparation, revision0.40

[Runner16](r08-native-runner.md) is prepared;8 Linux helper checks pass, not native
compilation/execution or JG-11 acceptance. Next actual Mac launch/setup output and
then targeted JN-01. Earlier evidence and remaining model/security/asset gates are
unchanged; no production stack selected.
