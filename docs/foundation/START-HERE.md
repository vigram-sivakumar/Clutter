# Resume Clutter foundation work

## Current checkpoint — I2a implementation46, 2026-11-16

The user approved “then let's freeze this and move to next step”.
[ADR-F010](adr/F010-tauri-implementation-baseline.md) is accepted for implementation:
**Tauri2 + one shared web UI/editor + PM/Y editing contexts + TypeScript Core/API +
SQLite/per-page transactional ports**. Rust/native adapters own host mechanisms,
not another semantic Core. UI/CLI/MCP are peer clients of the same authority.

The profiling comparison is stopped as an implementation prerequisite. Original
H01/budgets/pins/evidence remain unchanged. The explicit [entry override46](runtime-qualification/implementation-entry-override46.json)
schedules open safety/security/format and measurement cases at named milestones;
none becomes a pass. No comparative memory/latency winner is established. I2 still
uses marked disposable Spaces; no existing app route or user-selected vault access.

I2a code is implemented in packages/foundation-runtime: EditingContextRegistry
borrows the existing EditorSession, coalesces opens and preserves pending work and
undo history when views detach. Retirement delegates existing prepareClose policy;
active borrowers/unsafe close prevent destruction. No second mutation/save owner.
Linux validation: **89/89 runtime tests**, including 7 new registry and 2 actual
SQLite/Core/PM-Y integration tests; strict TypeScript passes. No native UI wiring
changed and no new Mac manual test is required for this slice.

NEXT: apply/commit delivery46 on architecture/clutter-foundation if not yet applied,
then implement **I2b shared editor/schema/codec extraction** per [I2 contract](i2/contract.md).
Inspect current imports, move the qualified implementation once into shared module(s)
with browser/backend entry separation, and replace experiment imports with that
same implementation. No production imports from docs/experiments or hardcoded
node_modules paths. Do not create a copied editor or empty package scaffolding.
Then I2c wires selected Tauri composition; I2d adds shared page/task feature UI.

Latest supplied45 analysis is a truncated user output fragment, preserved in46
with its limits. It confirms unvalidated input/frame/clock linkage, not a new host
failure. Do not request more recordings/exports or replay the old manual suite.
Earlier user manual passes remain valid within their recorded scope. No 45 commit
hash was supplied; inspect actual Git state before applying/moving code.

## Handoff authority

This file is the single current next action. AGENTS owns evergreen rules, product
contracts own behaviour; changelog/progress/evidence retain historical results.
Dated commands in older documents are historical, not tasks to execute again.
New chats need the latest branch/local commits, then AGENTS + START-HERE + F010/I2.
Do not infer native execution from source availability. No automatic commit/push,
main merge, legacy migration, profiling work or real-vault integration is authorized.
