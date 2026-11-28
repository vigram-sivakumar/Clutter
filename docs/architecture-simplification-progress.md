# Architecture simplification — progress

## Phase 1 — Shell and navigation (accepted)

Base for Phase 2: main `706860852804d31c16bf08ae4d4370fb41565565`. See [sidebar integration ledger](sidebar-final-integration-progress.md): owner-accepted build/native verification and full app regression 18,002/18,002 across 967 files, 214.83s. Remote main confirmed identical. Eight-worker forks configuration retained.

## Phase 2 — Notes and folders (unverified combined candidate)

Owner approved combined implementation and verification. Branch `testing/architecture-phase-2-notes-folders` from the verified base; no main or release change. Post-migration simplification; not a change to the original migration plan.

- P2-03: existing move/drop helper now shares note/folder facade dispatch, error reporting and optional old-level cleanup with sidebar and menu callers. Preserve menu-only settlement, drop rejection and collection batch silence; no new move rule or persistence path. Menus that did not own level ordering still do not write it.
- P2-04: remove unused FolderTree VaultQuery prop and recursive/caller/test fixture wiring. MembershipSelector remains the read owner, EffectivePageState remains the committed/durable reconciliation owner.
- P2-05: existing name-taken feedback module adapts the existing synchronous facade canRename result to rejection. Keep undefined success in sidebar, boolean success in PageHost, draft commits separate.
- P2-06/P2-07: consolidate exact sibling lookup for interactive folder creation and rename within FolderOperations, retaining case-insensitive lookup, exclusion of the renamed folder and ordinary create/move suffixing. Existing inline creation, modal create/metadata/open, zone picker and collection name validation are already distinct UI flows over the same facade; do not add a wrapper or change their behaviour.
- Keep P2-01/02/08/09/10: draft lifecycle, projections, independent Favorites interaction state, archive safety and contextual note destinations.

Pre-implementation contracts: specification §5, §6, §7, §12; ADR-017, 020, 023, 024, 049, 066; architecture rules 1–3, 5–7, 10–14 and rulebook §7. Existing public facade methods create/open/move/rename/updateMetadata and current canCreate/canRename checks remain unchanged; no Gate operation, queue, storage, Vault mutation, editor, Sync, Workspace or composition-root change. Only existing UI callbacks and a private collision lookup change; no new subsystem. Existing folder restore documentation is stale relative to ADR-026's current restore amendment; restore is out of scope and not modified. No new path construction logic; the existing lookup is retained once.

Regression coverage added for move success/failure/order and silent failures, rename feedback and shared create/rename collision scope. Existing behavioral assertions retained. Test fixture prop migration only. No runtime checks executed in remote session. Source diff must be reviewed; owner local gate: `npm run build --workspace=apps/app` and `npm run test:run` (combined complete affected suite), then `npm run dev:sandbox` native smoke: inline/modal/zone folder creation, collisions and cancel, note draft create, rename Enter/blur/Escape, sidebar/collection/menu moves, manual order, Favorites and restart. Record exact candidate SHA, commands, test counts and results; stop on failure. No promotion until all required checks pass and owner explicitly approves. Isolated testing-branch exception §7 applies.
