# ADR-F008: Per-page engine roots and atomic Space version sets

Status: **Proposed for bounded partition qualification**, 2026-11-15, revision0.48.
D02/D03/D07/D09/D11, M04/M06 and PS02/04/06. No production rule superseded.

## Context

Build21/22 prove canonical task placement, restore and external asset closure by
committing one Space aggregate Y payload. This is a useful control, not a scale
result. Every accepted fixture revision serializes that aggregate, and startup
deep-checks retained roots/files. Neither behavior is a production budget decision.

## Proposal

Use independently versioned engine state per page inside **one Space database**.
Each task is a canonical page with its own data and media references; notes own
single-placement task slots. A derived unique placement index has no public write
path and changes with canonical roots in the same SQL transaction. Do not introduce
a database per page or an independently writable JSON/Markdown body.

One serialized commit plan includes affected old-head guards, encoded new page
roots, index changes, required immutable asset references and stable operation
identity. One SQL COMMIT publishes all affected heads, Space commit identity and
the original outcome. Retry reads that outcome before applying optimistic guards;
changed reuse refuses. No client can apply a root batch directly to SQL.

Historical reads use a coherent Space version-set/snapshot context. A note's old
task slot must resolve the task version/cover/assets visible in that context, not
the task's latest root. Pins/leases retain the transitive version/asset dependencies
without copying task bodies into note versions. A current view and an old pin can share
an unchanged note payload but have different task-version resolution contexts.
Current views resolve the current set; old pins resolve the pinned set. Uniqueness
constrains active placement in a version set, not all historical rows.
No indefinite SQLite read transaction
for a suspended view, and no GC until lease/retention rules are qualified.

Task move changes note placement, not the task page body. Historical note restore
rechecks current ownership and refuses a reclaim/conflict; it does not silently
rewind an independently owned task page. Interactive context undo and retained
version restoration remain different services, with cross-page inverse policy
qualified before that feature is exposed.

An ordinary page edit must not encode/rewrite all other page payloads. Metadata
head/catalog/version-set storage, snapshot/delta/checkpoint cadence, startup deep
verification strategy and reference-host resource budgets require measurements
and explicit format decisions. Do not turn this proposal into an unmeasured
Space-wide JSON head-map rewrite or weaken integrity checks to meet startup targets.

## Alternatives and consequences

Keep aggregate Y roots as a correctness/control profile; do not label them broken
from unmeasured performance. Per-page partition adds coherent historical-root
resolution, transitive retention and multi-page validation obligations. Independent
page databases make one atomic task move harder and are not the proposed solution.
A different partition is eligible if it preserves those guarantees and meets agreed
budgets; code reuse/migration effort does not decide the result.

## Gate

Execute the frozen [PK01–10 contract](../page-partition-contract.json); retain exact
format/engine/runtime/SQL/filesystem/fault profile and structural write counters.
Re-prove the semantic/media closure from21/22 with real commits/old/new readers.
The [bounded proof24](../r08-page-closure.md) now passes PK01–10 headlessly, with
recorded counters, crash routes and limitations. Native/editor binding and broader
G-Q remain unqualified. Then resolve G-Q performance/format/native/security gates
for the scope before an accepted successor. No runtime result is created by this ADR.
