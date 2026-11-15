# When implementation begins

Revision0.48, 2026-11-15. **The next milestone is I1: shared Core/API module
implementation with disposable Spaces.** The proof work is implemented experimental
code; production feature work and user-vault migration have not started.

One scoped entry decision remains: review/adopt [F009](adr/F009-scoped-core-implementation-entry.md)
for the I1 boundary below, then build that slice. This is not another broad candidate
research round or a requirement to finish every feature/provider test first. It
also does not imply that unfinished G-Q/native/security/format gates have passed.
No completion-date promise is inferred from case counts.

## I1 scope to adopt before creating product modules

- Use the recommended PM/Y mechanisms and one TypeScript semantic implementation.
  Establish real module responsibilities/dependency enforcement, not empty packages.
- Implement one typed command/query catalogue and shared client. Derive validation,
  CLI help and MCP schema from that source; handlers are shared, never copied.
- Compose one Space service with the Vault/engine/platform ports. Storage/codec/
  launcher implementations remain replaceable behind explicit contracts. Do not
  blindly copy Node/SQL/DOM imports from proof modules into portable domain code.
- Deliver a disposable-Space page create/read/edit slice through desktop integration,
  CLI and MCP together. A dev host can test the desktop adapter without choosing
  the final native shell. Bind actual per-page editor views and context history; test
  overlap/remount/failed save/restart. Specify per-page private editor grants, staged
  updates and protected drafts; semantic full-body test commands are not a replacement
  for the origin-aware editor protocol. UI/CLI/MCP remain peers, not a CLI call chain.
- Exercise the common commit/outcome and immutable-media paths with integration
  tests. Keep the existing aggregate controls as evidence, not duplicate production
  implementations. Old app writes and new service writes never target one Space.

I1 is nonshipping/disposable data only. It cannot open existing user vaults, advertise
the experimental codec as final, auto-migrate or replace the production app's save
path. That is a scope boundary, not a postponed guarantee for the same real data.
Production host/runtime/discovery/IPC/grants and data-format choices are separately
qualified before they carry those responsibilities.

## Definition of done for I1

| Result | Required evidence |
| --- | --- |
| One semantic implementation | UI/CLI/MCP invoke the same handlers/catalogue; no adapter reducers or direct storage fallback |
| Enforced module graph | Portable model/contracts/core exclude DOM/native/OS/SQL imports; composition roots wire ports |
| One running writer per Space | Explicit process lifecycle/owner contract; no second service hidden behind “authority” naming |
| Per-page editor binding | Actual view/context tests on the new API; headless PK passes are not substituted for those tests |
| Commit/retry/recovery | Typed outcome/unknown-result behavior, expected-head conflicts, pending protection and cross-interface parity |
| Honest scope | Disposable marker/path restrictions enforced; no user-vault writes or unsupported format migration |

Do not repeat the user's entire old keyboard session. Retest changed integration
routes with automation and only targeted native input when a concrete build needs it.
If this environment still cannot run browser tests, record blocked and arrange an
actual supported test route before claiming per-page view binding passed.

## Gates before real-vault writes and shipping

G-Q remains unpassed for production/data-bearing scope. Required closure includes:

1. A selected, installed native/runtime route: actual app-closed discovery/bootstrap,
   alias/fencing, peer authentication/grants and measured runtime footprint/startup.
2. Honest macOS file/SQL durability and pending-protection behavior under actual
   native flush/permission/storage failures; Windows later behind the same ports.
3. Final schema/codec/version-set/retention/checkpoint choices, typed property and
   unknown-content rules, coherent history/pins, backup/export and migration rollback.
4. D11 reference host and workload dimensions/targets fixed before representative
   latency/memory/disk measurements. PK byte counts are not benchmark acceptance.
5. Explicit current-rule/ADR impact and migration cutover. No silently competing
   old/new mutation paths for one vault; no main merge of experiments as product code.

Each feature also needs its detailed contracts/inverses/tests before implementation
and full release coverage before shipping. Task pages/covers/embeds, templates,
calendar/reminders, recurrence and collections are not removed because I1 is small.
Cloud/provider enablement and live collaboration remain separate later gates.

## Exact next action

Review the concrete I1 scope/module contract and record the scoped entry disposition
in F009/decision register. If adopted for that limited scope, start model/contracts/
Core/API implementation and the disposable three-interface slice. Do not authorize
real-vault writes, a final native format or full G-Q by implication. If a specific
entry contract is missing, close that named item rather than restarting architecture
research. User confirmed ownership requirements are in [runtime ownership](runtime-ownership.md).
