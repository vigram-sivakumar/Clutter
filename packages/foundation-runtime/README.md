# Disposable Core implementation — I1a

Private, nonshipping workspace. Requires Node24.22.1 or newer with native TypeScript
stripping and node:sqlite. The existing app remains on its current save path.
No dependencies were added. The final production runtime/format is not selected.

Portable entry: contracts/catalogue, SpaceService, CoreClient, DesktopSession and
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

DesktopSession is a draft/save lifecycle adapter, not a rendered editor. Body
replacement is semantic CRUD, not the origin-aware editing protocol. I1b must bind
actual per-page EditorViews, undo contexts, staged updates/protected drafts and
immutable-media operations. No new native/manual testing is requested for I1a.
See docs/foundation/START-HERE.md and i1/contract.md for gates and exact next work.
