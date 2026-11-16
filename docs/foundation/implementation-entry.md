# When implementation begins

Revision0.51, 2026-11-16. **I1 implementation has begun with disposable Spaces.**
[I1a](i1/result.md) implements real private Core/API modules; [editor26](i1/editor-result.md) now qualifies actual per-page view/context/protection
in a DOM composition. [media27](i1/media-result.md) now adds immutable media API/history/closure.
Targeted native composition/presentation/lifecycle qualification remains. I1 is incomplete; user-vault migration has not started.

[F009](adr/F009-scoped-core-implementation-entry.md) is adopted for the I1 boundary
below, following the user's “proceed”; [the contract](i1/contract.md) preceded code. This is not another broad candidate
research round or a requirement to finish every feature/provider test first. It
also does not imply that unfinished G-Q/native/security/format gates have passed.
No completion-date promise is inferred from case counts.

## Adopted I1 scope

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

## Exact next action — targeted native integration

The scoped entry and I1a modules/catalogue/ports are complete; do not repeat that
review. Continue targeted supported native/browser composition and lifecycle qualification
as described in [media27](i1/media-result.md) and START-HERE. Keep
real-vault G-Q blocking. User confirms ownership requirements in
[runtime ownership](runtime-ownership.md).
