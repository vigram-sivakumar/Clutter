# I1a implementation contract — revision0.49

Approved scope: ADR-F009, disposable data only. I1a is a partial I1 milestone.
The private packages/foundation-runtime workspace contains portable contracts,
PageOperations, SpaceService, client and desktop draft session. Only the SQLite
adapter imports Node filesystem/SQL; runtime adapters translate transport only.
The service serializes operations and composes one PageOperations plus Vault.

Commands: page.create(operationId,pageId,kind,title,body,properties),
page.read(pageId,atSequence?), page.update(operationId,pageId,expectedHead,patch).
Every request has apiVersion1 and spaceId. Create/update IDs are stable on retries.
A single runtime schema catalogue generates request types, validation and the
CLI/MCP input schema. No client-side semantic reducers or raw file writes.

Engine port stages opaque immutable root bytes from a page projection and decodes
them. Vault port loads roots, resolves operation receipts and atomically commits a
root/head/version/outcome with optimistic guards. SQL storage is experimental,
not final format. The development composition reuses the qualified per-page Y codec;
no product module imports experiments, no writable JSON-body mirror is persisted.
Full-body commands exercise semantic CRUD only, not live editor context protocol.

Creation is permitted only through a factory that allocates a private OS temporary
directory with a random marker. Reopen validates real path, marker and database
identity; it never initializes missing or unknown data. A SQLite exclusive locking
mode fences same-path writers. This is not production alias/discovery/auth fencing.

Read/write scopes come from composition, never request fields. Mutation outcomes
are looked up before expected-head guards; changed commands cannot reuse an ID.
Unknown commit/reply outcomes keep the operation ID and block unrelated writes
until resolved. Desktop sessions preserve drafts on conflicts/unknown replies and
never discard newer local typing when an earlier save acknowledges. Reads at the
receipt sequence avoid adopting an intervening foreign head as the local base.
Dirty sessions cannot close silently. Durable protected drafts are I1b, not claimed.

The stdio CLI and MCP tools subset use the same client as the desktop adapter.
Installed discovery, native host, production peer grants/security and full MCP
conformance remain gated. Tests use an in-process service transport and separate
stdio processes; no external endpoint or production app changes are needed.

Next I1b: actual EditorViews/context grants/update protocol/remount/undo/protection,
immutable media API integration and targeted supported native execution. Preserve
old proof evidence. G-Q blocks real-vault writes, format migration and release.
