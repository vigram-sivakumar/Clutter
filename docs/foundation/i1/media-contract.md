# I1 media API contract — implementation27

2026-11-16, F009 disposable scope only; written before implementation27.
Extend the existing catalogue/PageOperations with media.import/replace/remove/list/
read. Import and replace carry expectedHead, stable operationId and bounded bytes;
read/list may select atSequence. Same handlers serve UI/CLI/MCP, no independent IO.

Canonical page Y links contain attachment ID -> hash/name/role. Immutable object
metadata (hash/mime/bytes) is canonical in the Vault catalog; root reference rows
are a derived index verified against engine links. Do not persist another body or
writable media manifest. Validate content/page/ID/cover/guard before publication.
A second cover import refuses COVER_EXISTS (qualified behavior); replace an existing
attachment explicitly and atomically, preserving its ID/role. PNG covers only in
this bounded adapter. Tasks and notes share the same page-ID operations.

Reuse qualified admission/association rules and immutable file mechanisms as shared
source, not copies. Publish staged bytes, flush, link without overwrite and flush
directory BEFORE a SQL root/reference/outcome commit. SQL failure leaves only an
unreachable object; retry/restart verifies/reuses it. No referenced bytes are unlinked.
Removal drops current association only. All historical and protected roots retain
transitive object references; missing/corrupt/symlink data refuses reads/reopening.

Every Core root commit/protection supplies its derived links; full audit verifies
all retained root indexes through the engine. SQL references and metadata change in
the existing transaction primitive. Old/full-body/editor writes preserve links;
raw editor updates cannot create or alter links. No renderer-side filesystem path.

Schema3 is disposable-only; schema1/2 temp stores refuse without migration/overwrite.
No garbage collection, release/retention policy, production format/native flush,
backup/migration, runtime/discovery/security or D11 performance claim. Earlier
bounded PNG/conventional-xref PDF admission is NOT a general image/PDF decoder or
security sandbox. General formats and actual native image/PDF display stay gated.
API tests must include notes/tasks, cover replacement, historical bytes, protection,
failed/unknown saves, real crash ordering, malformed assets and UI/CLI/MCP parity.
The existing app/main remains unchanged; no broad old manual-session replay.
