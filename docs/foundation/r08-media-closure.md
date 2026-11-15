# External media publication and historical retention

Revision0.46, build22, 2026-11-15. JG-13 bounded Linux proof: **12 media cases pass**,
including 13 real process-death boundaries. Proposed storage profile, not a
production media feature, renderer or platform durability acceptance.

Read [frozen protocol](experiments/r07-two-view/media/CONTRACT.md) and
[source guide](experiments/r07-two-view/media/README.md). Execution evidence is in
evidence/r08-22-2026-11-15.json; the original joined-core-contract.json is unchanged.

## Single source of truth

The existing entity Y root gains an asset registry and attachment associations.
The registry holds hash-keyed MIME/byte-length metadata once; associations hold
stable attachment ID, page ID, display name and body/cover role. Both notes and
tasks are pages. A task retains its cover and body attachments when moved to
another note. Rendered placement and page metadata are projections, not copied
task bodies or file bytes. No subtasks are introduced.

Canonical media bytes live only in immutable files named by SHA256. SQL stores
one accepted Y root and the original operation receipt; its in-DB blobs table
remains empty. Two associations for identical bytes reuse one object. Display
names never become filesystem paths. At most one PNG cover per page is supported
by this fixture. Full block placement/rendering, additional image formats and
cover-replacement UX remain future implementation contracts, not product exclusions.

## Publication and failure behavior

The shared owner validates bounded bytes, writes an exclusive random stage file,
flushes it, publishes a no-overwrite hard link, flushes the object directory and
verifies hash/size/type before the common SQL root/outcome transaction can begin.
New parent directories are flushed too. Only known committed state is acknowledged.
Existing objects are verified/re-flushed; a matching filename alone is insufficient.

Crashes before commit can leave an incomplete stage or complete unreachable file.
The owner never scans those into current data. Exact retries verify/reuse bytes
and produce one original receipt. Corrupt existing objects refuse import rather
than being overwritten. Removing the current reference never deletes a file;
historical roots and pins retain access. Missing/truncated/corrupt historical bytes
refuse media reads and writable reopen without destroying/replacing saved roots.
Root metadata may still be inspected by an already running owner for diagnosis;
that does not assert the missing media is readable. No garbage collector is included.

The only common Store changes are optional external-state validation, model-owned
read methods, and awaiting model staging. SQL transaction/outcome/recovery code is
reused. Entity-model extension maps are explicitly declared; the original entity
profile remains strict. CLI and MCP use the same owner commands and byte checks.

## Evidence

| Cases | Executed result |
| --- | --- |
| MA01–02 | PNG/PDF note/task body and cover associations, task move, same-hash reuse, pinned old version after all current removals/restart |
| MA03 |13 SIGKILL phases: before stage, half-written stage, before/after file sync, publish, before/after directory sync, BEGIN, root/outcome, before/after COMMIT and before reply |
| MA04 | Flush checkpoints precede SQL; injected pre-flush exceptions/save failure leave root unacknowledged, retry commits once |
| MA05–06 | Complete orphans remain unreachable; corrupt orphan is never overwritten from incoming bytes |
| MA07–09 | Missing/truncated/corrupt historical files, symlink redirection, invalid bytes/MIME/cover/destination/base64/size all refuse safely |
| MA10–12 | RPC/CLI/MCP receipt parity, external bytes absent from SQL/Y, restart closure, task edits retain media and old profile refuses writable open |

Regressions:14 entity cases and84 Node tests pass. Two additional headless port
cases pass for the existing snapshot and joined Y profiles, including CLI/MCP/RPC
retry, failed writes, uncertain-COMMIT resolution and restart. Fresh browser suites
were attempted but blocked before browser execution by Chromium's Unix socket
restriction in this environment; raw attempts are retained. This is **not** a new
browser pass or a product assertion failure. Earlier editor/native passes stand.

The initial media run had one wrong test expectation for the size-limit error:
base64 length rounding permitted decoding, then the byte cap correctly rejected
the input before publication. Expected error was corrected; final12 cases pass.
The failed attempt is retained, not erased. Tiny valid PNG/PDF fixtures are versioned
source inputs, independently checked by Pillow and pdfinfo, not generated app output.

## Limits and next action

Linux fsync/SIGKILL evidence does not prove power-loss recovery, macOS full-flush/
directory behavior, Windows file publication or a production signed/sandbox route.
The file port must remain platform-specific. PNG admission is bounded RGBA8;
PDF checks are structural for a conventional-xref subset, not a general decoder,
sanitizer or malware defense. All bytes are inert in this proof. No active content
or native media rendering is exercised. Limits are fixture limits, not final
product file-size/format decisions.

JG-12/13 now have bounded closure evidence, alongside the prior joined/native
work. Next is a decision-readiness review: reconcile the gate ledger and ADRs,
identify which baseline choices are supported and which remain blocked by G-Q
performance/partitioning, installed runtime footprint, native file durability,
discovery/grants/security/distribution, migration/format and broader feature tests.
Do not declare all architecture/release gates green or begin a production rebuild
automatically. No repeated Mac keyboard session is needed for this step.
