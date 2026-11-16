# ADR-F009: Scoped entry to Core/API implementation

Status: **Accepted for disposable I1 implementation only**, 2026-11-15, revision0.49.
No full production baseline or prior production rule is superseded.

## Context

Joined/native/entity/media/per-page proofs now support the recommended mechanism
combination within declared bounds. PK01–10 are headless, not an actual per-page
editor binding. Runtime/native/security/format/performance G-Q remains open.
The user asks when product implementation begins and requires no duplicate owners.

## Proposed limited decision

After this scoped entry review, begin I1: real shared model/contracts/Core/API
modules and a desktop/CLI/MCP page slice over disposable Spaces only. Core rules
are implemented once. Space service names that Core's running application instance
composed with one Vault adapter; “authority” is historical terminology, not a
second business service. Public clients do not call the CLI or write files/SQL.

I1 may use a clearly experimental storage/runtime adapter behind ports; it may not
open existing vaults, promise the final native format, auto-migrate or ship data
durability/security guarantees that have not passed their gates. This scope does
not move G-Q for real-vault writes or G-F for release. It permits an honest module/
integration milestone rather than waiting for every future feature before coding.

See [implementation entry](../implementation-entry.md) for exact scope/definition
of done and [runtime ownership](../runtime-ownership.md) for the single-writer rule.
No empty forwarding package tree or copied proof transaction engine is accepted.

## Adoption requirements

Record a scoped disposition and ensure the initial command/module/port contracts
and disposable-data enforcement are concrete before writing product modules.
Test actual per-page view/context binding, shared three-interface handlers and
dependency rules during I1. G-Q native/runtime/format/budget/security/migration
and precise old-rule impact stay blocking before any real-vault cutover.

The original0.48 proposal required a scoped entry disposition rather than automatic
acceptance from10 PK passes. The disposition below now adopts that limited boundary
following the user's instruction to proceed; production gates remain unaccepted.

## Scoped disposition — implementation25

The user's “proceed”, following the ownership and desktop clarifications, authorizes
this limited implementation. It does not accept G-Q or a production stack/format.
I1a implements typed page CRUD, shared Core, SQLite Vault, CLI/MCP adapters and a
desktop draft session. I1b must bind actual per-page EditorViews/context updates,
media operations and protected drafts before I1 is complete. No legacy application
rule is superseded: the new private namespace cannot open old or real vaults, and
apps/app is not wired to it. The legacy PageOperations/PersistenceGate/Vault path
continues to own existing production data. The new Core PageOperations is the sole
semantic page facade for its separate disposable Spaces. Service composition is
not another semantic owner. See [I1a contract](../i1/contract.md).
