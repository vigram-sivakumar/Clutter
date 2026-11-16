# Resume Clutter foundation work

## Current checkpoint — I2b shared editor extraction47, 2026-11-16

User reports delivery46 applied and asks to proceed. No commit hash supplied;
inspect actual branch before applying another patch. [F010](adr/F010-tauri-implementation-baseline.md)
is accepted: Tauri2, one shared web UI/editor, PM/Y contexts, TypeScript Core/API,
SQLite/per-page transactional ports. Rust/native code owns mechanisms, no second
semantic Core. UI/CLI/MCP are peer clients. I2 uses marked disposable Spaces only.

I2a46 retains EditingContextRegistry leases over existing EditorSession. I2b47 now
places editor/schema/history/browser+backend codecs/engine in runtime/src/editor,
with explicit browser/backend package entries and declared locked dependencies.
I1 integration paths re-export the same functions. Standalone comparison snapshots
remain isolated, never dependencies of shared product code. See [extraction result](i2/shared-editor-extraction.md).
No existing Core/session/Vault policy or product behavior changed.

Validation: **93/93 runtime tests**, strict TypeScript, source-equivalence audit,
offline npm lock dry-run; isolated historical page10/entity14 cases pass. New browser
entry builds/runs without Node globals, backend bundles without qualification sources,
actual editor/SQLite/CLI/MCP/crash/media regressions pass. These are Linux/build checks,
not Mac native/measurement acceptance. No manual replay needed for extraction.

NEXT: apply/commit47 if pending, then **I2c selected Tauri desktop/headless composition**
using shared runtime/editor entries. Prepare an actual selected-host composition
outside docs/experiments; package shared browser UI + Core, UI/CLI/MCP as peers,
headless owner independent of windows. Integrate registry leases, per-view selection,
existing protection/failure guards and platform-only OS/Rust ports. Do not copy old
fixture reducers or use a UI-to-CLI business route. Installed discovery/admission/
fencing/native durability remain explicit milestones under override46. I2d adds
page/task feature UI/operations after this shared composition is runnable.

No further host comparison/profiling is an entry task. [Override46](runtime-qualification/implementation-entry-override46.json)
schedules unproven H01 cases at implementation/data-safety/release milestones; none
becomes a pass. Original H01/pins/budgets/evidence unchanged. Keep user manual passes;
no latency/whole-process-memory ranking. No existing app/main/data route changes.

## Handoff authority

This file owns the single current action. AGENTS/product contracts own evergreen
rules/behavior. Changelog/progress/evidence retain history and failed attempts.
New chats need latest branch/local commits, AGENTS + START-HERE + F010/I2 contract.
Do not infer native execution from source availability. No automatic commit/push,
main merge, migration project, real-vault access or profiling task is authorized.
