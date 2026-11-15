# JG-13 external image/PDF closure — frozen proof contract, 2026-11-15

Extend the existing entity/Y profile and SQLite Store/host; never build a second
transaction engine. Proposed bounded storage representation, not a final product
format or native media renderer. No user vault/session is used by the tests.

Canonical bytes are immutable objects named by SHA256 under store/media/objects/.
The accepted Y root holds asset metadata once per hash and attachment associations
by stable ID/page ID (note OR task)/name/role. Body or cover associations use the
same path; cover accepts PNG in this fixture and at most one cover per page.
Moving a task does not move/copy its cover/body attachment ownership. No duplicated
file bytes in SQL/Y; decoded maps, locations and view data are projections.

Publication order MUST be: validate bounded bytes/type; exclusive random stage
file; complete write; file fsync; atomic no-overwrite link into objects; objects
directory fsync; verified hash/size/type readback; then root/outcome SQL COMMIT;
only then acknowledge. Flush new parent directories too. Existing same-hash files
must be verified/re-flushed, never overwritten or trusted from a filename alone.
Stages/objects remain private regular files; reject symlink/non-directory parents.

Crash before SQL may leave a partial stage or complete unreachable object. Neither
becomes current from directory scanning. Retry uses the same semantic operation;
verify/reuse a complete object and commit one root/receipt. Changed operation-ID
reuse fails. A failed/uncertain flush/publication/commit cannot acknowledge a root.
Post-COMMIT lost replies resolve from original receipt, never import twice.

Removing current associations never unlinks bytes. Historical roots/pins retain
their metadata, associations and required objects; reading historical media uses
that immutable root, with hash/size/type verification. No GC, orphan adoption,
background cleanup or migration. Missing/truncated/corrupt referenced objects fail
closed on reopen/read and must not be silently recreated or replaced. Unreferenced
orphan bytes may remain, including after failed commits; this is intentional.

Admission is a bounded inert-byte proof: <=256KiB PNG/PDF, CRC/inflate-bounded
RGBA8 noninterlaced PNG subset, and basic structural checks for conventional PDF
xref layout. Real valid fixtures must be independently decoded/inspected. This is
NOT a general PDF validator, malware filter, renderer sandbox or full image codec.
Production formats, limits, JPEG/etc, native rendering and PDF adversarial corpus
remain explicit qualification work. No active PDF content is executed here.

Required evidence: valid PNG/PDF external imports; note/task/cover parity; metadata
and no SQL file-byte copy; same-hash reuse; historical pin/read after removal;
real process death through partial stage/file sync/publication/dir sync/root and
outcome/COMMIT/reply boundaries; exact retries; publication/flush/save failure;
corrupt existing object cannot be overwritten; missing/truncated historic bytes
fail closed; orphan remains unreachable; RPC/CLI/MCP share one command path; entity
and existing Store regressions still pass. Record actual filesystem/flush profile.

Linux fsync/process-kill results do not prove power-loss or macOS F_FULLFSYNC/
directory-flush behavior. Preserve those platform release gates. Existing native
manual passes stand; no repeat Mac session or provider/cloud work in this proof.
