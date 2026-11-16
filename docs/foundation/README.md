# Clutter foundation

Revision0.70,2026-11-16. Working branch: architecture/clutter-foundation.
[F010](adr/F010-tauri-implementation-baseline.md) accepts Tauri, shared web UI/editor,
PM/Y contexts, TypeScript Core and SQLite ports for implementation. Final native
safety/format/security and shipping qualification remain open at explicit milestones.
I2a context ownership is implemented; I2b shared editor extraction is next.
Existing production rules/data remain isolated from this disposable namespace.

Start with [AGENTS](AGENTS.md), then [START-HERE](START-HERE.md), the single current
checkpoint/next action. Give a new agent access to the latest branch/local commits;
conversation memory and this agent's scratch files are not the handoff mechanism.

## Current planning and source ownership

- [Freeze readiness](freeze-readiness-review.md): accepted implementation baseline versus remaining
  format/security/qualification responsibilities; superseded planning is labelled.
- [Product contracts](product-contracts.md): P01–P39 confirmed direction.
- [Shared platform contract](shared-platform-contract.md): one web UI/editor/Core,
  Mac first and Windows/browser capability adapters from the start.
- [Greenfield scope](greenfield-scope.md): no existing users/data migration; initial
  schema/version/recovery/portability guarantees remain.
- [Architecture readiness](architecture-readiness.md), [decisions](decision-register.md),
  [ADRs](adr/README.md), [implementation entry](implementation-entry.md): evidence,
  accepted/proposed scope and production limitations.
- [Shared API](shared-api.md), [runtime ownership](runtime-ownership.md),
  [platform boundaries](platform-boundaries-spec.md): single command/authority design.

## Evidence and roadmap

[Roadmap](roadmap.md) owns dependencies; [remaining H01 gates](runtime-qualification/remaining-gates.md)
tracks matched host qualification. [CHANGELOG](CHANGELOG.md) is specification/delivery
history; [native progress](NATIVE-TEST-PROGRESS.md) retains dated runs/user observations.
Current action stays in START-HERE, not in dated instructions embedded in old proofs.

Bounded mechanisms are documented in [R07 history](r07-history-ownership.md),
[joined Core](r08-joined-core.md), [entity](r08-entity-closure.md),
[media](r08-media-closure.md), [page roots](r08-page-closure.md) and [I1](i1/result.md).
F009 permits disposable I1 implementation; prior proof/manual passes do not imply
full native/security/format/Windows/Web/shipping acceptance. H01 measurement method
and workload status stay separate from implementation helper-test counts.

The current native manual recording is saved/readable on the user's Mac.45 adds
one bounded relationship inspection and a freeze-readiness review. Its Mac execution
is pending; the ZIP/helper tests are not native input-to-display evidence. No new
recording is needed for this action. See START-HERE for exact plan ID and command.

No automatic main/production/vault modification, commit or push. Generated builds,
runtimes/traces/cache remain Git-internal. Source and deliberate scoped evidence
are reviewable separately. Older instruction/index text is retained in45 evidence
and Git; no raw evidence or confirmed product result was deleted.
