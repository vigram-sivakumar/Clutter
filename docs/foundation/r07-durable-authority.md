# Durable authority qualification proof

Revision 0.37, 2026-11-14. Isolated R07 P-SQL experiment. **18 bounded cases pass
on Linux; no storage, editor or host architecture is accepted.** Production and
previous native/manual results are unchanged. [Evidence](evidence/r07-29-2026-11-14.json)
contains the exact profile, source hashes, commands and raw results.

## What this establishes

A real child process owns a local SQLite store. Browser commands, subprocess CLI
and stdio MCP call that same owner. Its serialized command path admits a guarded
operation, writes its complete revision/current pointer and original outcome in
one transaction, then acknowledges durability after COMMIT. A disconnected client
reconnects with a fresh capability and queries/retries the same stable operation.
It cannot create a second effect by crossing interfaces or restarting the owner.

The browser has two read-only document projections and a provisional insert input.
It receives notification hints and explicitly reads authoritative revisions. It
can catch up after a dropped hint and reconnect after restart. This is a browser
command-client proof, **not the previous full PM/Y editor, native window, pending
editor-step reconciliation or durable undo-stack integration**. The earlier
[history proof](r07-history-ownership.md) remains a separate qualified boundary.

## Executed profile and ownership

| Property            | Executed value or boundary                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Runtime             | Node 24.22.1, Linux x64; built-in `node:sqlite` test binding                                                                        |
| SQLite              | 3.53.4; exact source ID/compile options in retained results                                                                         |
| Settings read back  | WAL, synchronous FULL (2), locking EXCLUSIVE, foreign keys ON, trusted schema OFF, 4096-byte pages, cache 8 pages and spill enabled |
| Single owner        | One exclusive connection for its lifetime; second live or SIGSTOP-paused-owner attempt fails `OWNER_BUSY`                           |
| Restart             | SIGKILL releases the OS-held lock; fresh owner validates roots, then persists a new epoch; bearer token rotates                     |
| Canonical state     | Retained immutable `{doc, attachments}` revisions and one current pointer; tasks only embedded in doc                               |
| Other durable roles | Original operation receipts, version pins, content-addressed in-DB bytes and explicitly provisional recovery records                |
| Transport           | Authenticated loopback test HTTP; Host/Origin checks, bounded JSON; MCP uses the shared pinned stdio handler                        |

The [Node SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
is a test binding, not a desktop framework/language decision. Runtime capability
and SQLite version checks reject unsupported profiles. The
[SQLite WAL documentation](https://www.sqlite.org/wal.html) rules out using a live
WAL database across machines; this store must remain local. It also documents a
WAL-reset fix in 3.51.3; this proof requires that version or later and records the
actual build. This is not a comprehensive vulnerability audit. PRAGMA values are
read back because [unknown PRAGMAs can be silently ignored](https://www.sqlite.org/pragma.html).

## Commit, retry and recovery contracts

The [frozen DO contract](experiments/r07-two-view/durable/contract.json) specializes
[R04](vault-persistence-spec.md) for this fixture; it does not replace that spec or
mark entire PF scenarios complete. The implementation and runnable instructions
are in the [experiment](experiments/r07-two-view/durable/README.md).

Accepted content has one revision chain. Protection writes a separate draft with
its base revision and generation, never a fabricated content revision. Pins and
protection metadata have committed receipts but do not increment content versions.
Restoring an old content version or a recoverable draft creates a new revision.
Only a prior-owner draft whose base still equals current may be explicitly restored;
a live-owned or stale-base draft is refused and preserved.

Exact duplicate lookup precedes stale-version/target resolution. Reusing an
operation ID with different semantic input fails. Pre-admission rejections are
not persisted as accepted receipts. An uncertain COMMIT result carries an outcome
reference; transport loss is unknown, never a claim of rejection. A failed rollback
makes the owner unavailable pending reconnect rather than allowing further writes.
The browser retains the same operation while its reply is unresolved, but has no
durable client journal across browser closure.

Recovery generations only increase. Releasing generation 1 cannot erase generation
2; a released head retains its generation tombstone, preventing stale protection
from resurrecting after restart. Checks at startup validate retained state hashes,
parent/current coherence, accepted revision/receipt links, foreign keys and referenced
blob hashes, including history and active recovery roots. Missing/corrupted tested
closure fails closed; there is no fallback to an older acknowledged state or empty
vault. These are corruption-detection checks, not tamper-proof storage.

## Executed evidence

| Cases        | Observed result                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DO-01–02     | One live/paused owner; rotated credentials; browser, real CLI and MCP see the same versions; mutation notifications cannot write                              |
| DO-03–06     | SIGKILL before BEGIN, after revision/outcome writes and before COMMIT leaves prior content with no receipt; stable-ID retry applies once                      |
| DO-06 detail | Checkpoint first truncates WAL to zero; large synthetic attachment forces new uncommitted WAL frames before kill                                              |
| DO-07–09     | Post-COMMIT kill/lost CLI reply and synthetic lost COMMIT return resolve to the original receipt after restart; desktop retry also keeps one effect           |
| DO-10        | Competing guarded revisions admit one winner; concurrent exact duplicates share one receipt; changed payload/foreign destination refused                      |
| DO-11–13     | Kill inside protection rolls back; committed draft survives restart separately; stale cleanup/tombstones/conflicting recovery protect work                    |
| DO-14–15     | Task body/ID/properties stay coherent, pinned old content remains historical, restore creates a new revision; retained attachment references keep their bytes |
| DO-16        | Altered root, missing receipt/blob, changed blob and unsupported schema fail closed; missing DB/nonempty init cannot reset content                            |
| DO-17–18     | Real SQLite allocation-full rollback/retry and browser catch-up after a lost hint/owner restart pass                                                          |

Regression: 84 existing Node checks pass (including the preserved raw-history
reproducer). The unchanged matched history/live-API contract remains 24 passes,
6 explicit protective refusals, no gaps/failures; strict exits 0. The common stdio
handler extraction changes no domain behavior in either earlier candidate.

## Limits and next action

The failure profile is actual child-process death at observed application boundaries
on this Linux filesystem. SIGKILL is not power loss or an OS crash; the harness does
not kill inside SQLite's COMMIT/VFS call. Lost COMMIT return is explicitly injected
after a successful real COMMIT. `max_page_count` produces real SQLite allocation-full,
not physical volume ENOSPC. No macOS/Windows, permission-loss, fsync/VFS or power
failure guarantee follows. Settings alone are not evidence for these guarantees.

Tiny synthetic attachment bytes are inside SQLite. This deliberately avoids
cross-file commit ordering and **does not qualify external image/PDF files,
decode/render or production asset scale**. Full snapshots/no GC are a bounded
proof, not a storage/performance design. Pinned version readability is demonstrated;
unpin/GC leases, export/backup, migrations, multi-document task moves/recurrence,
provider outbox/ingestion and live collaboration remain unqualified. No live DB
belongs in an iCloud/Drive folder. Optional provider snapshots remain governed by
[provider protocol](provider-sync-spec.md).

**Next: R08 architecture decision review package.** Compare complete candidate
combinations using the history and durable proof, identify proposed choices,
rejected alternatives, unresolved gates and affected existing ADRs. Specify the
minimal joined editor-to-durable-core/native smoke needed before final acceptance,
including provisional input and selection/history. Map outstanding R02–R06 policy,
encoding/security and performance gaps to explicit now/later gates. Do not select a
stack because it is the current implementation or infer production approval from
these 18 cases. Keep this branch and prepare reviewable proposed ADRs; no production
implementation or new broad manual session is the next step.
