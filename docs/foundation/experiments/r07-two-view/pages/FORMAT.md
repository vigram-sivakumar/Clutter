# PK per-page commit profile — frozen before implementation, 2026-11-15

Separate marked schema5 disposable store; no production format or migration.
The existing Space service/Store owns the ONLY SQLite connection/transaction path.
Core policy is shared with the aggregate controls through extracted pure planners;
page codec and SQL adapter are storage/engine mechanisms, not second task rules.

`page_catalog` owns stable ID/kind. `page_roots` stores immutable hash-bound per-page
Y payloads; prefix binds codec, schema1, Yjs13.6.33, page ID and kind. Page Y owns title, typed properties,
body and own attachment links; no canonical task copy in note slots. One task slot
means placement; zero means independent page/inbox. `page_heads`, current task,
block-ID and attachment indexes are derived and updated inside the same transaction.
`page_changes` maps Space commit/page to immutable root, supporting historical as-of
reads. Common revisions rows contain only that commit's changed-root references,
not a whole-Space Y state or a cloned full head map. Common outcomes are reused.

The shared Store gains a staged commit context: core stage returns a descriptor
plus ephemeral page-write plan. Only the descriptor is serialized in common roots;
the plan inserts page payloads/heads/indexes through the common transaction callback.
Expected affected heads are checked before staging AND during SQL commit. One COMMIT
includes page rows/heads/indexes, Space commit and original outcome. No BEGIN/COMMIT
or reducer in the page adapter/CLI/MCP. File publisher/format validation are reused.

Current/historical queries capture a Space commit context. The same note head can
show old or new task/cover depending on context. Pin/lease manifests store root/hash
references for the selected note/task and transitive task/media closure, not copied
bodies. Leases persist until explicit release; no expiry/GC. No long-held SQLite
transaction for a reader. Current-placement uniqueness excludes historical rows.

Fixture:3 notes/2 tasks; two headless read/edit clients of one note and one paused
observer. Actual EditorView/browser/native routes remain unqualified here if the
known browser block persists. Frozen PK01–10 execution fields stay unchanged.
All history/files retained; startup deep audit remains an explicit test oracle,
with decode/encode/byte counters. No tiny-fixture performance or lazy-startup claim.

Page properties and body/cover links exist for notes AND tasks. The PM body schema
is still a minimal fixture, not a restriction on intended first-class task pages.
Whole-Space aggregate profiles stay as controls. No user vault/native session/main
changes. Production implementation entry is reviewed after PK with remaining G-Q
native/runtime/format/budget/security blockers; this proof is not that implementation.
