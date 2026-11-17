# Clean Clutter rebuild

Status: authorized reset scope; delivery51 provides the concrete removal/rebuild plan.
The goal is a clean, stable architecture. Existing implementation, editor UI and
documentation have no entitlement to survive. Keep overall layout intent and useful
global components, redesign anything else. No existing users/data need migration.
The user authorized checking main read-only; origin/main5c532f8443321c0784cb379a184ed97f13de1820
is the committed visual/behavior reference, not a pipeline to merge into foundation.

## What the audit establishes

The foundation branch has1077 non-test JS/TS source files under apps/app/src; fetched
main has1080. Tests974/978 are counts of source files, not passing tests. Type-only,
barrel and literal dynamic imports are included in the conservative graph. Main
App/AppShell/AppLayout/PageHost transitively depend on legacy Core, CM6/Lezer, old
editor and platform code. PropertyList also crosses all four boundaries. Retaining
these controllers would retain the old architecture. Their visual layout is the
reference; their implementations are replacement targets.

Button, Input, Dialog, Overlay, Menu, ToastProvider, AppIcon and useTheme have none
of those imports in either inspected graph. They are candidates, not a blanket
approval of their API, styles, focus/accessibility or every component in the folder.
Keep only when reuse simplifies the new system. CSS/assets require separate review:
retain useful colors/type/layout, remove .cm-* and Markdown-specific compatibility.
One existing missing Reference.css import is exposed in both graphs; do not repair
obsolete reference UI merely to preserve it. Full reports are linked below.

Main includes newer collection/task grouping/indicator/space-avatar/date styling
work. Preserve useful product intent; do not merge its Application/Vault/Markdown
code to acquire the styling. The audit covers committed remote main only, not
unpublished changes on the user's machine. No branch switch, app execution or
main modification occurred.

## Final code boundaries

Use these responsibility boundaries, creating/moving a package only when it owns
real code. Names below are the target plan; do not scaffold empty placeholders.

| Target | Owns | Must not own |
| --- | --- | --- |
| apps/desktop | Tauri entry, Rust/OS composition, packaging and startup | Document/task/save business rules or a second UI |
| packages/core | Shared API/contracts, Space operations, accepted revisions, sessions and ports | React, DOM, OS/filesystem/SQLite imports |
| packages/editor | PM/Y schema, headless engine/codec, editor commands/history and browser binding/NodeView adapter entries | App navigation, native APIs, another persistence path |
| packages/ui | Shared React application, layout, global primitives and feature/editor components | SQL, filesystem, native calls or independent document reducers |
| packages/desktop-runtime | Node storage/assets/transport/discovery, headless Core composition, peer CLI/MCP and OS mechanisms | Another semantic page/task implementation or product UI |

The UI supplies renderer/component factories to the editor adapter; editor does
not import the product UI. That keeps dependencies acyclic. Desktop composes the
UI with platform/client ports. A future browser composition uses the same UI and
contracts with a browser backend adapter; Node/SQLite does not run in the browser.
Mac first; Windows mechanisms live at explicit platform seams rather than inside
shared UI or domain modules. Do not create a second native feature UI.

Current foundation-runtime/foundation-ui contain useful proofs/mechanisms but can
be split, renamed or rewritten. Their filenames/API shapes are not compatibility
requirements. Update callers in the same change; no long-lived forwarding façade.
The tiny Foundation demo is retired after the new product boot is runnable, not
maintained as another application. Existing apps/app is also retired; one product
entry and one shared product UI remain. React remains the product UI technology.

## Editor UI is redesigned as components

The current CM6 widgets/decorations/Markdown-offset handlers do not define the new
component architecture. Design real React components for block controls, slash/
mention pickers, formatting/link tools, table row/column controls, task cards,
image/PDF UI, comments and property editors. Reuse global primitives when suitable.

ProseMirror owns editable content DOM and text transactions. React owns surrounding
UI and noneditable surfaces through the NodeView/component adapter; two renderers
must not reconcile the same editable subtree. Components dispatch editor/Core
commands, never replace the document from a second React text/JSON store. Selection,
scroll and interaction state stay view-local; sessions retain pending work/history;
Core owns accepted content, identities, revisions and transaction outcomes.

Each window/pane/tab/focused editor has explicit identity/context. Dialogs/toolbars
retain the appropriate view bookmark. Native events and external updates use the
same operations/revision reconciliation. No global “the editor/active note”. Task
pages, single placement, read-only embeds, history/pinned versions and the agreed
table/keyboard contracts survive even when all old code is removed. The bounded
paragraph proof is not the final product schema or a feature ceiling.

## Ordered teardown and implementation

| Step | Concrete work | Completion evidence |
| --- | --- | --- |
| R0 —51 | Import inventory, main visual-reference snapshot, teardown map, native-lock export and canonical plan | Static reports, tool checks, explicit source/behavior limits |
| R1 | Check in real native tool/Cargo lock graph; establish new product entry and actual shared modules. Select minimal global presentation/layout assets; remove the old app boot, CM6/old-Core tree and incompatible controllers in the same coherent replacement slice | Fresh-checkout locked build, React layout + real Core-backed page create/list/open/edit/save/reopen; no CM6/old Core imports in new graph |
| R2 | Implement real editor schema/component adapters and interaction profiles: text/blocks, tables, tasks, media, focus/selection/history | Editor and shared-view behavioral tests plus narrowly required native checks |
| R3 | Complete agreed product flows: navigation/windows/panes/tabs, daily notes/templates/folders, task/property/collection UX, history/search/recovery and interchange | Same shared UI/Core operations from desktop/CLI/MCP; stable IDs and revisions |
| R4 | Remove retired modules/dependencies/docs/fixtures and close data-bearing/native/security/format gates; representative scale/performance/distribution before claims/shipping | Import/ownership/build checks and truthful qualification ledger |

The app may be temporarily incomplete during the rebuild; there are no existing
users to preserve an old runtime for. R1 can omit feature screens; mark scope honestly rather than retain
legacy controllers underneath them. No dual writers, old/new canonical stores,
user migration, rollback compatibility or legacy API adapters. Git history retains
old code. Do not merge unrelated main changes or delete uncommitted user work.
page.list and some feature operations do not exist yet: define real catalogue/Core
queries before wiring the sidebar, not a fake UI list or old Vault passthrough.

## Deletion and documentation map

| Existing area | Disposition |
| --- | --- |
| apps/app/src/features/markdown; CM6/Lezer; packages/engine if present | Retire. Rebuild required behavior and editor UI on the new model; no canonical Markdown editor |
| apps/app/src/core and old Application/PageOperations/PersistenceGate/Vault/session/watch/cache pipeline | Replace wholesale; retain desired guarantees through new Core, not old class names |
| AppShell/AppLayout/PageHost and domain-dependent hooks/feature hosts | Rebuild orchestration; use existing layout only as visual reference |
| Global primitives/theme/icons/fonts | Selective extraction only after import/API/style review; no folder-wide keep rule |
| Old editor DOM widgets/decorations/menus | Design components and transaction adapters; discard old internals |
| Existing Tauri commands/platform code | Audit mechanisms individually; remove old business/state owners. Preserve needed entitlements/assets/build facts deliberately |
| Old automation/editor/internal tests | Retire implementation-coupled tests with deleted code. Reimplement confirmed behavioral acceptance against new APIs |
| Foundation demo and forwarding/proof modules | Retire after useful mechanisms/tests/fixtures are promoted and one product boot works |
| Old architecture specs/ADRs, experiment guides, duplicate progress/recovery next-action documents | Replace with one current architecture/product/development index. Obsolete files can be deleted, not kept as permanent archive folders |
| Old evidence/traces and qualification logs | Preserve truthful current outcomes/open risks in a short ledger; detailed history remains in Git, no obligation to keep every historical file in active docs |

Before deleting docs, remove live test/build imports from docs and capture native
locks; move only still-useful fixtures to package test directories. No permanent
production dependency on documentation or an earlier developer machine's cache.
Replace root ARCHITECTURE_RULES/checklists and entry documentation with current
ownership invariants as part of R1; legacy wiring prescriptions must not survive
as accidental constraints. Never rewrite old results into passes while consolidating.

## Format and release boundary

The implementation direction is structured block/page data in local SQLite with
separate immutable assets. Markdown is interchange, not a second writable canonical
mirror. Keep native interchange/export and Markdown loss reporting in product scope.
Freeze the initial native Space/schema/version/recovery format before user-selected
real-data use; a filename extension is not a reason to restart host comparisons.
Continue using marked disposable data until safety/security/format gates close.
No prior-user migration or conversion project is needed.

## Immediate next input and work

The current developer runner still derives native dependency locks from an earlier
Mac build. We cannot produce those exact transitive Cargo/npm lock bytes from source
metadata alone. Export the completed build's dependency files once using
export-native-locks.mjs, then attach the resulting ZIP. It excludes session/endpoint/
boot config, credentials, notes, binaries and traces. This is a read-only source-lock
capture, no rebuild, benchmark or repeated manual suite. It runs on the user's
current Node; it does not change toolchains or dependency versions.

With those files available, proceed with R1's reproducible product skeleton and
coherent old-boot removal. This plan is the reviewable sequence; it does not require
keeping code out of courtesy. User-authorized dismantling is not blocked by the
old pipeline's documentation. Refine the plan for concrete findings, not another
open-ended architecture research phase.

## Evidence and known limits

- [Main reference](../evidence/rebuild-plan-51-2026-11-17/main-reference.json),
  [main inventory](../evidence/rebuild-plan-51-2026-11-17/main-inventory.json),
  [foundation inventory](../evidence/rebuild-plan-51-2026-11-17/inventory.json).
- User passed bounded composition editing, remount, text undo/redo, close and
  same-Space reopen. Caret displacement remains intermittent/currently unreproduced;
  user asked to move on. No additional51 editor fix or native caret pass.
- Baseline108 runtime + strict TS checks are from50.51 changes only planning/tools/
  handoff. Two planning-tool tests pass; no new product-runtime or Mac claim.
- No latency/aggregate-memory winner, shipping security/durability or full product
  feature acceptance is inferred. F010 choices remain accepted; host research closed.
