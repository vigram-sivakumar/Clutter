# Architecture Decision Records

These record why the target architecture (`docs/architecture-target.md`, frozen in `docs/architecture-specification.md`) made the specific calls it did, for the decisions future contributors are most likely to question or want to relitigate. Each ADR is either **Accepted** (binding — changing it requires a new ADR that supersedes it, not a PR that quietly drifts) or, if one is ever superseded, marked **Superseded by ADR-XXX**.

| ADR | Title | Status |
|---|---|---|
| [001](./001-single-persistence-gate.md) | One Persistence Gate for all page/folder writes | Accepted |
| [002](./002-capability-facades.md) | Capability facades (`PageOperations`/`FolderOperations`) replace the fragmented service layer | Accepted |
| [003](./003-vault-authoritative-model.md) | Vault as the sole authoritative in-memory domain model | Accepted |
| [004](./004-lazy-projections.md) | Lazy evaluation for speculative projections instead of deletion | Accepted |
| [005](./005-navigation-router-scope.md) | Navigation Router scoped to view-level intent only | Accepted |
| [006](./006-workspace-separation.md) | Workspace kept as a separate, non-persisted navigation-state subsystem | Accepted |
| [007](./007-platform-abstraction-scope.md) | Platform abstraction kept minimal — no premature multi-backend design | Accepted |
| [008](./008-composition-root-two-phase.md) | Two-phase Composition Root construction (`bootstrap` / `attachVault`) | Accepted |
| [009](./009-delete-orphaned-packages.md) | Delete orphaned `packages/engine` and `packages/editor` rather than integrate | Accepted |
| [010](./010-retain-document-editing-engine.md) | Retain `DocumentEditing` (formerly `core/engine`) unshrunk as an internal collaborator | Accepted |
| [011](./011-phase1-persistence-gate-rescoping.md) | Phase 1 rescoped to build create/delete fresh, not migrate them | Accepted |
| [012](./012-phase2-application-layer-consolidation.md) | Phase 2 application-layer consolidation — scope and divergence record | Accepted |
| [013](./013-phase3-move-backend-and-presentational-dedup.md) | Phase 3 — Move backend/UI split, Restore/Delete UI, presentational dedup — scope and divergence record | Accepted |
| [014](./014-phase4-composition-root-and-navigation-cleanup.md) | Phase 4 — Composition root and navigation cleanup, including a Startup-sequence spec amendment | Accepted |
