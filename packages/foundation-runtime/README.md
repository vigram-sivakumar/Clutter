# Shared foundation Core and editor runtime — I2

Private, nonshipping workspace. Requires Node24.22.1 or newer with native TypeScript
stripping and node:sqlite. The existing app remains on its current save path.
The existing locked jsdom29.1.1 is now declared as a direct dev dependency; no new
external package versions were added. F010 selects the implementation direction; final shipping format/native guarantees remain gated.

Portable entry: contracts/catalogue, SpaceService, CoreClient, EditorSession, DesktopSession and
engine/Vault interfaces. SQLite and stdio entries are opt-in Node adapters. One
running SpaceService binds a Vault instance; PageOperations is its sole internal
semantic page facade. No UI/CLI/MCP adapter owns another document implementation.

`SqliteVault.createDisposable()` allocates a new private OS-temp directory. Reopen
requires that same marked temporary path and matching database identity. No API
creates a store at a user-provided path. Do not use this for user notes.

Root commands: npm run foundation:test and npm run foundation:typecheck after
normal root npm ci --ignore-scripts (Node24.22.1+ for tests). Editor dependencies
are now declared and pinned here; shared product code never imports docs/experiments
or hardcoded node_modules. Public editor/browser and editor/schema entries are
browser-safe; editor/backend contains the existing bounded engine/hash codec.
See docs/foundation/i2/shared-editor-extraction.md for module/dependency boundaries.
I1 harness paths re-export these same mechanisms. Some legacy integration test
fixtures/pack tooling remain under docs until selected composition I2c; they do not
appear in the shared runtime source import graph. Standalone comparison snapshots
remain isolated historical implementations; do not use them in new product code.

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


Implementation27 adds media.import/replace/remove/list/read through the same Core.
63 runtime tests pass. Immutable objects are flushed/published before SQL refs;
removal never unlinks retained bytes. Root link indexes are verified by Core/engine
on composition. Files/formats/admission helpers here are also reused by old proofs.
The profile admits bounded PNG/conventional-xref PDF only, not general decoders or
security. Schema3 refuses earlier temp stores without migration. No dependency change.

Actual native media rendering/inline placement/URL lifecycle and close handling are
next. EditorSession protection does not journal pending media commands or unsent
file bytes; a host must resolve or durably protect those before allowing close.
Do not bundle the Node-based dev codec directly into a browser/WK renderer; compose
a browser-safe codec/bridge behind the existing ports. No shipping/real-vault claim.


Native28 adds a browser-safe view adapter/composition and durable media ingress
which journals exact commands+bytes before close protection acknowledgements and
replays through Core. Root envelope/projection/rebase are shared; CoreClient verifies
root/media SHA.77 automated cases pass. Native build scripts live at root; Mac
compilation/manual observations remain required. See docs/foundation/START-HERE.md.
All generated native artifacts use Git-internal clutter-native28 storage, not source.
Qualification app is synthetic-only; no production shell/native durability/security
acceptance. Empty notes remain saveable per the note schema; task constraints stay.
