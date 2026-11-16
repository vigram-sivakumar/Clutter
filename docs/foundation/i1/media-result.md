# Media API integration — implementation27

Historical media checkpoint. Current targeted host: [native28](native-result.md).

Revision0.51, 2026-11-16. **Media API/publication/history/editor compatibility pass;
I1 remains partial.** F009 disposable scope only; existing app/main/user data unchanged.
[Contract before code](media-contract.md), [review/evidence](../evidence/i1b-media-27-2026-11-16/review.json).

| Boundary       | Implemented and tested                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Core       | media.import/replace/remove/list/read in existing inferred catalogue/PageOperations/SpaceService; same UI/CLI/MCP handlers                                  |
| Canonical data | Page Y links hold attachment ID -> hash/name/role; immutable object catalog owns MIME/length; root ref rows are derived, audited against engine links       |
| Publication    | Stage/write/flush/link without overwrite/dir-sync BEFORE SQL refs; same atomic root/ref/metadata/outcome transaction                                        |
| History        | Removal affects current association only; replacement preserves old bytes/names; all retained historical/protected roots keep transitive references         |
| Integrity      | Metadata/hash/byte/admission checks; missing/truncated/symlink objects and bad derived indexes refuse reads/composition                                     |
| Editors/tasks  | Notes/tasks share API; task covers/PDFs/body associations; real CLI/MCP media with mounted editor saves/undo; protected draft closure after current removal |
| Retry/crash    | Expected-head/admission before publication, unknown outcomes/restart/exact receipts;11 real process-death trials around import/replace publication and SQL  |

63 runtime tests pass (44 previous +19 new). Strict TypeScript and prior media12,
page10, entity14 and Node84 regressions pass after factoring shared source. The
qualified file/format/admission/association code moved once into runtime; old proof
imports/re-exports it. No copied publisher or new semantic owner. No dependencies/
lock versions changed. First attempts caught Y JSON rejecting null-prototype schema
objects (normalized at engine boundary) and a regex import-scanner false positive
(replaced by TS AST). Earlier failures are retained; final runs are passing.

Only the new Core byte/reference API is qualified here. This is NOT general image/
PDF decoding, PDF security/sandboxing, inline PM media nodes/placement, native image/
cover/PDF presentation or URL lifecycle. The inherited admission subset is bounded
PNG RGBA8/noninterlaced up to256x256 and conventional-xref PDF, max256KiB. These are
prototype limits, not changes to intended product/task-page capabilities.

Schema3 is experimental, refuses temp schema1/2 without migration and never admits
user vaults. Publication orphans may remain unreachable; they are not a journal of
user intent. Referenced bytes/roots/protection are retained without pruning/release/
GC. Startup deep audits are unmeasured, not performance qualification. Linux fsync/
process-death tests do not prove macOS fullsync/power-loss/native storage behavior.

## Exact next work — targeted native composition

Freeze the NEW Core host/browser-safe renderer/media lifecycle test contract, then
build that targeted route. Keep Node codecs/filesystem on service side; current
Node-based DOM dev adapter cannot be assumed browser-bundle compatible. Actual
image/PDF/cover presentation/resource lifetime/inline placement require their own
implementation and supported host tests. Preserve old native sessions/manual passes.

Native close must also resolve or durably journal pending media requests/bytes.
EditorSession protects editor.apply, not media.import/replace/unsent file bytes.
Do not allow close/reload to silently drop those, or treat orphan files as recovery.
No manual/native test is required just to apply27; no old lab replay. I1/G-Q remain
open for production runtime/auth/discovery/grants, native flush, final formats/
retention/migration, full editor feature coverage and fixed D11 budgets. Read
[START-HERE](../START-HERE.md) for the single current checkpoint.
