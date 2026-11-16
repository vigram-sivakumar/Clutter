# Existing UI reuse and clean architecture replacement — proposal

Status: **Discussion required before product rewrite.** User clarified after47:
keep the existing UI/components, replace the CM6/Markdown architecture completely;
anything architectural may be removed, with no existing users/data migration.
User then authorized wrapping pending48 work. That does not silently approve a
full replacement sequence or promote the two-view development screen to product UI.

## Observed coupling

- apps/app/src/app/AppShell.tsx constructs legacy Application, accesses vault and
  native mechanisms, and imports CM6 Markdown table normalization. It is not just
  visual shell code that can be pointed at a new editor component.
- app/layouts/app-layout/AppLayout.tsx and app/layouts/page/PageHost.tsx import
  Application/VaultResource, legacy session/workspace hooks, persistence failure
  types, and editor-specific image overlays. Separate their presentation from
  orchestration and old domain/view models deliberately.
- core/application, core/vault, recovery, ingest/frontmatter/Markdown parsing,
  file watchers and editor history caches form the old semantic/data pipeline.
  Audit ownership before removal; do not retain it merely to keep an old API alive.
- components/design-system/icons/CSS contain reuse candidates. Some components
  have domain/OS imports, so folder location alone does not prove independence.
- CM6/Lezer editor extensions, Markdown offsets/decorations, frontmatter-owned
  metadata and implementation-specific tests are replacement targets. Desired
  user behaviors remain requirements and get tests against the new model.

## Proposed sequence for discussion

1. **Inventory boundaries.** Produce keep/rebind/replace/delete lists with file
   groups, import edges and responsibility. Preserve UI appearance and useful
   behavior; identify mixed components needing presentation extraction.
2. **Agree final repository and boot ownership.** Decide where the rebuilt app
   lives, reusable React UI modules, Core/editor/platform entry points and build
   commands. The development app48 is a composition checkpoint, not a second
   permanent product or parallel UI maintenance commitment.
3. **Define UI contracts and a removal map.** Stable ID routes, query/view models,
   focused commands, session leases and required catalogue operations first.
   page.list is not implemented: add its real Core contract when needed, never
   fake it in a sidebar or keep a legacy Vault behind a compatibility facade.
4. **Retire the old boot/data path.** After agreement, remove CM6/Lezer and the old
   Markdown/session/persistence/domain plumbing in coherent groups. User permits
   deletion/replacement; Git history preserves old implementation. No migration,
   old/new dual writers, compatibility façade or permanent parallel pipeline.
   Amend architecture documentation explicitly where legacy wiring rules retire.
5. **Reassemble the existing UI on the new contracts.** Reuse presentation once,
   replace orchestration, and connect one end-to-end page flow: create/open/edit,
   shared views/history, save/protect/reopen. Keep platform mechanisms behind ports.
6. **Rebuild feature slices.** Tabs/panes/windows and focused commands, full task
   pages/properties, notes/daily notes/templates/folders, tables/keyboard behavior,
   history/recovery/search, cover/image/PDF and other confirmed contracts. Agree
   ordering and acceptance scope before coding these product slices.
7. **Remove leftovers and verify.** Dependency/import checks prove no CM6, old
   canonical Markdown/frontmatter writer or retired pipeline in the product graph.
   Rewrite useful behavior tests; retire tests tied only to deleted internals.
   Close remaining native/data safety/format/security gates before real notes,
   representative performance/distribution gates before release/claims.

Deletion is authorized as a tool of the agreed rebuild. No legacy code has been
removed by48 and no production wiring is changed. We should discuss this sequence
and reuse boundaries before starting phase1 implementation/deletion. The architecture
baseline F010 and confirmed product behavior remain valid; host research stays closed.
