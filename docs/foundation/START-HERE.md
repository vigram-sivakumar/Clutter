# Resume Clutter foundation work

## Current checkpoint — Cargo cache recovery49, 2026-11-16

User confirmed48 applied as c50963c4; dependency install completed. Native setup
stopped BEFORE compilation: offline global Cargo index offered tauri-build2.6.3
while locked graph requires2.7.4. Earlier build34 used isolated Git-internal
CARGO_HOME;48 omitted it. No native window or Mac compilation pass inferred.
49 restores a dedicated private Cargo home seeded with the prior registry only;
no prior config/credentials or cache contents are changed. Offline locked fetch
first; if missing, one setup-only online --locked acquisition, then digest check.
Compile remains --locked --offline. No version downgrade or unlocked resolution.
10 targeted Linux tests pass (2 new +8 composition). Earlier102 runtime/strict TS
results remain scoped to48; no new full-suite/native claim.

NEXT: apply/commit49, then npm run foundation:desktop. No root dependency reinstall
or global Node/Rust change is required for this correction. Prior failed build is
retained; no session existed from that failed attempt. First ask whether Saved and
both views appear, then bounded changed-route closeout. Keep the plan below.

User explicitly clarified: retain existing UI/components, remove/replace the entire
old CM6/Markdown architecture; no users/data migration, nothing architectural must
be preserved for compatibility. Discuss cleanup/replacement plan before product rewrite.
User then authorized resuming and wrapping pending composition work48.

48 source implements a **separate disposable development composition**, not a
replacement product UI: apps/foundation-desktop + shared foundation-ui controller,
existing foundation-runtime Core/editor, peer CLI/MCP and packaged pinned Node.
apps/app is unchanged and still uses the old pipeline. No existing code was removed.
Minimal two-view UI is integration-only, not a second permanent product design.
See [composition result](i2/desktop-composition.md).

Validation:102 runtime tests + strict TS + offline root-lock dry-run pass on Linux.
Mac build/signature/native close/window checks are pending, not inferred. H01 raw
contracts/budgets/pins/evidence unchanged; no host profiling task or performance claim.
F010 remains the accepted architecture baseline, with override46 milestones open.

After49 fixes acquisition, continue the existing composition launch/check scope.
The runner bootstraps pinned Node24.22.1 before Core loads, no global Node change.
First ask only whether Saved and both views appear. If successful, guide a bounded
changed-route editing/remount/close check. Existing old/manual passes need no replay.
The first build needs verified native locks from the prior completed Mac build;
read-only seed, not imports of old implementation. Missing seed must fail explicitly.
Generated locks/provenance must be captured for fresh-checkout tooling later.

**After composition closeout: discuss [clean rebuild plan](i2/rebuild-plan-proposal.md)
before further product implementation/deletion.** Inventory keep/rebind/replace/delete
boundaries, agree final repository/boot ownership, retire old pipeline and reconnect
the existing presentation to new contracts. No migration/compatibility facade or
parallel writer. Do not automatically begin I2d features or promote the demo UI.

## Handoff authority

AGENTS owns evergreen rules; product contracts own behavior. This file owns current
next action, changelog/progress/evidence preserve history and failed attempts.
New chat needs latest branch/local commits then AGENTS + START-HERE + F010/I2.
No automatic commit/push/main merge, real-vault access or profiling. Native source
availability does not establish Mac execution or mean existing product was rebuilt.
