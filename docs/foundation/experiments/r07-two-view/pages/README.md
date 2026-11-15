# Per-page Space service proof24

Read [result/limits](../../../r08-page-closure.md), [frozen format](FORMAT.md)
and [PK contract](../../../page-partition-contract.json). Run `npm run test:pages`
from the experiment package with the existing compatible Node24/SQLite profile.
No browser/native app needed. `npm run test:page-native-port` is a headless old
native-model metadata callback regression, not a macOS test.

One shared Store executes transactions/outcomes. pages/model.mjs stages per-page
payload plans and performs storage/reference callbacks; it imports shared entity
planners/validators, media admission and the file publisher. pages/codec.mjs owns
Y serialization only. owner.mjs composes that one Space service; mcp.mjs only wires
shared framing/schema. CLI uses the existing thin transport. No second writer or
adapter business reducer. No BEGIN/COMMIT in this profile; common Store owns it.

Root ledger descriptors contain only changed-page references. Pages are hash-bound
Y blobs; current heads and task/block/attachment indexes are transactional derived
lookups. Page catalog identity and immutable payloads have one commit owner. Historical
queries resolve page/task/media against the requested Space context. Pin/lease
manifests hold references, never copied task bodies. Leases require explicit release;
all roots/files retained, no GC or hidden orphan adoption.

The fixture has3 notes/2 tasks, two headless projection clients and a paused observer.
Those clients are not EditorViews. Per-page Y context update/protection and native
binding remain I1 work. heads/metrics are diagnostics; normal clients should use
page reads/known heads rather than fetch the whole catalogue on each keystroke.
Pin/lease metadata does not advance content sequence here; a production metadata
cursor/notification contract remains required. Public names/documentId compatibility
are not frozen product APIs.

Tests use private temporary marked stores, never existing user vaults/native labs.
Results go to ignored artifacts/. Keep aggregate profiles as controls. Structural
bytes and deep-audit counters do not establish speed/RSS/WAL/startup targets. Note
properties in the page candidate are an explicit difference from the minimal
aggregate control; no benchmark-win claim. Current state supports task properties,
cover/body associations and independent page identity; minimal PM content is not
a product restriction on task covers/body/embeds. No subtasks introduced.

Next: scoped implementation-entry decision then real Core/API modules on disposable
data, with all real-vault/native/runtime/format/budget/security/migration gates intact.
