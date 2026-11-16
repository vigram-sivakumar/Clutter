# I2: selected Tauri composition and shared page editing

Authorization: accepted F010, 2026-11-16. This is implementation work. Host research
is closed for entry; open qualification follows override46 and its safety milestones.
Use the existing marked disposable Space boundary until data-bearing gates close.
No legacy app route, real vault, main merge or automatic migration is authorized.

## Implementation baseline

Tauri2 desktop, shared web UI/editor, PM/Y context integration, one TypeScript
Core/API and SQLite/per-page root ports. Rust/native code handles host mechanisms.
One accepted mutation/commit/outcome path for UI/CLI/MCP. Browser/Windows boundaries
remain explicit from the start, with no OS imports in shared product logic.
Existing experiment dependency/runtime pins are evidence, not a permanent promise
to ship that runtime without support/security/version checks.

## Sequence and deliverables

| Slice | Deliverable | Gate |
| --- | --- | --- |
| I2a (46) | Shared EditingContextRegistry over existing EditorSession | Concurrent acquire shares one context, view release retains pending/history, active leases block teardown, unsafe close retains/retries through same session |
| I2b (next) | Move PM/Y editor/schema/codec binding once into shared module(s), with browser/backend entry separation | No production import from docs/experiments or hardcoded node_modules; same actual editor/codec/history implementations, focused regression/import-graph checks |
| I2c | Tauri desktop + packaged Core/CLI/MCP composition from shared modules | Platform-only Rust/OS ports, app-independent single Core owner, real shared browser build; installed discovery/grants/fencing remain explicit until qualified |
| I2d | Shared page/task editing UI with stable routes, properties/media and required operation contracts | One UI, typed API/catalogue, same Core handlers, no hidden direct storage writes or duplicated semantic reducers |

I2b module placement/dependency details are finalized against current import graph
before moving code. Do not create empty package trees or copy a second implementation.
The current proof factory may remain a test composition, not a shipping dependency.
New optional list/query/feature commands need catalogue/contracts first; don't invent
an unimplemented page.list API in UI. Task page capability is not limited to current
paragraph-only fixtures. Full feature behaviour remains governed by product specs.

## I2a lease/lifetime contract

The registry is a browser/OS-neutral integration adapter. Key is
(spaceId,pageId,contextId), validated through the existing editor.open catalogue.
A composition factory opens the existing EditorSession; concurrent callers share
its promise and instance. Different window/editing contexts retain separate undo.
This registry is not a global active editor, process election or authorization grant.

Each view/navigation owner borrows a lease. Detach/destroy its own view BEFORE
releasing the lease. Release is idempotent and never saves, protects, destroys a
session or evicts its history. Reacquire after the last view closes gets the same
context. Local accepted/draft/origin state remains solely in the existing service/
EditorSession; the registry keeps only keys, borrow counts, promises and references.
Cursor/range/scroll/focus remain per-view and are not copied into this registry.

Explicit context retirement refuses active borrowers. It blocks a simultaneous new
acquire and delegates prepareClose/destroy to the existing session. Unsafe close or
teardown error retains the entry; next acquire/retry uses the same pending operation
and history. Failed initial open removes its reservation for retry. No LRU/automatic
retirement policy yet: releasing every view does not discard pending work or undo.
Caller navigation cancellation must release any lease obtained after a stale route.

Window-close composition must first freeze interaction and use existing session
prepareClose while views/leases remain live. On refusal keep the views/focus. Only
after safe disposition detach/release and retire contexts; new failures retain them
for remount. Registry.close alone is not the complete window/reload guard, and no
new close policy/flush/recovery reducer is introduced here. I2b/c integrates that UI
lifecycle; this first slice is not wired into a new native shell yet.

## Acceptance and current limits

Seven focused registry tests and two real SQLite/Core/PM-Y integration cases cover
concurrent sharing, identity isolation/validation, failed-open retry, idempotent
release, active lease protection, unsafe-close retention, closing races and teardown
errors; actual remount undo/redo and failed-save+failed-protection pending recovery
are exercised through EditorSession. Full runtime/strict TS checks recorded in46.
No Mac manual replay required for this pure integration module. Native/window UI,
cache/selection persistence policy and production OS guarantees remain subsequent
work. Generic registry tests do not replace native acceptance.
