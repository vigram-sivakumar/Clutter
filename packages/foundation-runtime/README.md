# Disposable Core and editor context implementation — I1

Private, nonshipping workspace. Requires Node24.22.1 or newer with native TypeScript
stripping and node:sqlite. The existing app remains on its current save path.
The existing locked jsdom29.1.1 is now declared as a direct dev dependency; no new
external package versions were added. The final production runtime/format is not selected.

Portable entry: contracts/catalogue, SpaceService, CoreClient, EditorSession, DesktopSession and
engine/Vault interfaces. SQLite and stdio entries are opt-in Node adapters. One
running SpaceService binds a Vault instance; PageOperations is its sole internal
semantic page facade. No UI/CLI/MCP adapter owns another document implementation.

`SqliteVault.createDisposable()` allocates a new private OS-temp directory. Reopen
requires that same marked temporary path and matching database identity. No API
creates a store at a user-provided path. Do not use this for user notes.

Root commands: `npm run foundation:test`, `npm run foundation:typecheck` after the
normal root dependency install. Integration tests also need the existing locked
PM/Y experiment dependencies: from docs/foundation/experiments/r07-two-view run
`npm ci --ignore-scripts --workspaces=false`. Tests reuse that qualified codec via
an explicitly temporary composition adapter in docs/foundation/i1; actual runtime
source imports no experiment modules. No copies of writable JSON bodies persist.

CLI/MCP stdio adapters accept a CoreClient transport. Tests launch real separate
stdio processes with a private parent-IPC dev composition. There is no installed
`clutter` binary/discovery/native host or production MCP-conformance claim yet.

DesktopSession is the historical I1a semantic draft control. Interactive editing
uses EditorSession exclusively; it binds a renderer/CRDT port and preserves context
history across view destruction. An explicit dev PM/Y composition now runs actual
EditorViews in jsdom with23 new tests (44 runtime tests total). DOM scroll is disabled
in tests and uncaught DOM errors fail them. This is not browser/native qualification.
Schema2 stores peer-bound receipts and protected drafts separately from canonical
heads; schema1 temp stores are refused without migration. Protected snapshots stay
retained; automatic release/GC and production grant lifecycle remain unimplemented.

The earlier I1a limitation below is historical. Body
replacement is semantic CRUD, not the origin-aware editing protocol. Editor26 now binds actual per-page views, context updates/history and protection
in DOM tests. Next I1b integrates immutable media operations and qualifies the
changed route on a supported browser/native host. No new native/manual testing is requested for I1a.
See docs/foundation/START-HERE.md and i1/contract.md for gates and exact next work.
