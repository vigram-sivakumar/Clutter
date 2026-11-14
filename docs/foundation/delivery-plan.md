# Delivery and review plan

Status: proposed sequence; no production implementation authorized by this pack.

| Gate               | Reviewable result                                                              | Completion condition                                                                             |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| G0: scope          | This charter/contract pack and current capability inventory                    | Confirm requirements and resolve priority/scope ambiguities, including collaboration and history |
| G1: specification  | Detailed editor matrix, schema, API, history, security and lifecycle contracts | No ambiguous behaviour in the qualification scope; every fact has one owner                      |
| G2: qualification  | Isolated vertical slice and native/collaboration evidence                      | Related matrix cases pass; explain failures and qualify complete architecture combinations       |
| G3: baseline       | Accepted ADRs and end-to-end specification                                     | Resolve blocking choices, record trade-offs and explicitly supersede affected old rules          |
| G4: implementation | Production vertical slice through app/CLI/MCP                                  | Domain, persistence, protocol and native tests pass with recovery/history guarantees             |
| G5: expansion      | Remaining feature increments and deployment readiness                          | Coverage, reliability, performance and interoperability gates met for declared scope             |

## Specifications to complete

Expand this pack in place with linked, non-overlapping specifications: product
feature inventory; editor/input contract; semantic schema/migrations; vault and
asset layout; IPC/CLI/MCP schemas; UI/navigation/accessibility; interchange;
collaboration/security; history/retention/backup; and performance budgets.
Each behaviour has one authoritative specification with references from the rest.
Do not create a second master architecture document that contradicts this index.

## Change discipline

Before an increment, identify requirement IDs, accepted ADRs, owning modules,
contract signatures, affected callers, failure states and required tests. If a
contract is missing, update/review it before implementing that behaviour. Agents
must not infer a new storage, identity, undo or permission policy from convenience.

Review changes for dependency direction, duplicate business rules, direct adapter
writes, hidden authoritative caches, mapping/selection resets and destructive
lifecycle transitions. Reuse shared policy and mechanisms; do not force unrelated
capabilities into generic abstractions solely to reduce similar-looking code.

After implementation, run the scoped checks, inspect outcomes and update only
actual evidence/status. Full-suite and native checks are required at relevant
integration/release gates. Preserve reproducible regressions when a bug reveals
a contract failure. Keep production, experimental and rejected code distinguishable.

## Branch and patch handoff

Use `architecture/clutter-foundation` for this work. Do not create phase branches
without a new instruction. Pull/rebase policy must preserve the user's commits
and uncommitted changes. This delivery consists only of additions under
`docs/foundation/`; existing documentation and application code are untouched.

Each handoff names its base commit, changed scope, checks and remaining gates.
Patches are incremental against the stated base; do not repeatedly apply an
initial patch after it is committed. Future sessions must inspect actual branch
state before producing another patch. Commit/push remains the user's workflow
unless explicitly requested otherwise.
