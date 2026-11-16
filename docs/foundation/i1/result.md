# I1a result — implementation25

Revision0.49, 2026-11-15. **I1 implementation has begun. I1a passes; I1 remains
partial.** F009 authorizes disposable data only. Product package:
packages/foundation-runtime. Existing app/main/user vaults are untouched.

| Boundary               | Implemented and tested                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contracts              | One runtime catalogue infers request types/validation/CLI help/MCP schema; strict version/field/content-envelope/property checks                                   |
| Core                   | One internal PageOperations, one queued SpaceService bound to one Vault; injected scopes checked before receipt lookup                                             |
| Vault                  | Real SQLite with opaque qualified Y roots; several guarded page roots/heads/revisions/outcome in one Space sequence; stable retries and same-path writer exclusion |
| Desktop adapter        | Draft lifetime, conflict preservation, exact retry after unknown reply, newer typing retained, acknowledged historical base, dirty-close refusal                   |
| CLI/MCP                | Separate stdio processes over the same client/Core; private parent-IPC test transport, not installed discovery or production grants                                |
| Boundaries             | Portable imports traverse without Node/SQL/DOM dependencies; runtime source imports no experiments; apps/app imports no new runtime                                |
| Disposable enforcement | Factory-owned private OS temporary path; marker/SQL identity match; symlink/missing/unknown/corrupt stores refused without initialization                          |

21 integration tests and strict TypeScript5.9.3 pass on Linux/Node24.22.1. Tests
include real child-process death before/after COMMIT, multi-page guard failure/
rollback/restart, lost commit/transport reply, immutable operation identity and
CLI/MCP/desktop receipt parity. Initial multi-root receipt prototype mismatch was
fixed; raw failing attempt is retained with the passing final run.

The temporary dev composition reuses the previously qualified per-page Y codec.
Actual product source does not import proofs. The SQL transaction/unknown-COMMIT
primitive and bounded MCP framer were extracted once and reused by proof controls;
legacy semantic models remain retained controls, not new production writers.
Root lock changes only register the private workspace. No new third-party deps.

Regressions pass: PK10, entity14, media12, Node84, two old snapshot/joined headless
cases and one native-context metadata callback. An additional durable suite passed
DO01 then stopped at a missing browser executable; the native-helper suite passed
NP01–03 (including bundled app-closed CLI/MCP), then met the same environment block.
Those two suites are not full passes; raw runner failures are retained and classified
as blocked. No fresh browser, Mac input, performance or native durability acceptance.

[Raw evidence and review](../evidence/i1a-25-2026-11-15/review.json) distinguish these
results. No whole acceptance-matrix row or G-Q is passed by this bounded work.

## Exact next implementation — I1b

Bind actual per-page EditorViews/context grants and staged Y updates to this Core,
with origin-aware undo/remount/catch-up and durable protected drafts. Integrate
immutable media operations through the same API and multi-root Vault transaction.
The I1a paragraph-only full-body adapter is semantic CRUD, not live editing, final
schema or a restriction on task-page body/cover/embed product requirements.

Keep disposable enforcement and shared catalogue/handlers. Arrange supported
browser/native execution for the changed route before claiming I1 complete; do not
replay the old broad manual session. Production native/runtime/discovery/grants,
flush, final format/history/retention/migration and fixed D11 budgets remain G-Q.
See [START-HERE](../START-HERE.md) for the single current handoff.
