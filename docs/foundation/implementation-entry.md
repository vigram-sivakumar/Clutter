# When implementation begins

> Current disposition (revision0.70, 2026-11-16): [F010](adr/F010-tauri-implementation-baseline.md)
> accepts Tauri and shared structural mechanisms for I2 implementation. Host profiling
> is no longer an entry prerequisite; open cases follow the explicit override46
> milestones, never a passing result. Use [START-HERE](START-HERE.md) for the current
> I2b shared editor extraction action. Prior planning/next commands below are historical
> wherever they conflict with this accepted decision. Disposable data boundary remains.


Revision0.56, 2026-11-16. **I1 implementation has begun with disposable Spaces.**
[I1a](i1/result.md) implements real private Core/API modules; [editor26](i1/editor-result.md) now qualifies actual per-page view/context/protection
in a DOM composition. [media27](i1/media-result.md) now adds immutable media API/history/closure.
[Native28–30](i1/native-result.md) now has guided user-reported NC28-01…04 passes,
plus supplied app-closed CLI read PROTECTED at sequence38. [Scoped completion
review](i1/completion-review.md) records I1 complete for the tested disposable
integration profile. Existing-user/data migration is out of scope (P-37); production reliability/security
qualification remains open.

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
   unknown-content rules, coherent history/pins, backup/export and future schema-version
   safety. No current-data migration or migration rollback implementation is required.
4. D11 reference host and workload dimensions/targets fixed before representative
   latency/memory/disk measurements. PK byte counts are not benchmark acceptance.
5. Document the clean new ownership/ADR boundaries. No legacy API/format preservation,
   user migration or dual-write cutover is required. Keep one canonical mutation path;
   experiments are not silently merged as finished product.

Each feature also needs its detailed contracts/inverses/tests before implementation
and full release coverage before shipping. Task pages/covers/embeds, templates,
calendar/reminders, recurrence and collections are not removed because I1 is small.
Cloud/provider enablement and live collaboration remain separate later gates.

## Historical I1 exit action — superseded by F010/I2

The scoped I1 integration is complete; do not repeat the old/native manual suite.
Prepare the contract/exit criteria for production host/runtime/discovery/auth/alias
fencing/native ports and D11 reference workloads/targets before implementing or
measuring that route. Keep the single Core with peer UI/CLI/MCP adapters. Existing
new-data G-Q format/security/native durability gates remain blocking; legacy data
migration is explicitly out of scope (P-37).
See completion review and START-HERE for evidence limits and delivery state.

## Historical next-action update — revision0.56

H01 contract is now prepared; do not repeat that writing step. Next safe Mac host
inventory, then exact versions/instruments/host binding before matched builds.
START-HERE and runtime-qualification/README.md are current. No app/real-vault wiring.

## Actual host/preflight33 checkpoint — 2026-11-16

User32 commit44c624ac; hardware inventory supplied M4 Pro48GiB/Mac16,7/14 logical
CPUs/macOS26.6.2 build25G83/native arm64. Source evidence and exact candidate
version metadata in host-preflight33 evidence + runtime-qualification/preflight-
manifest.json. H01/budgets unchanged;48GiB is not16GiB performance evidence.
Next run run-preflight.mjs for remaining existing tool/environment capabilities,
then matched isolated builds34. No repeated generic inventory or NC28 manual tests.
Framework binaries/checksums/complete locks/actual metrics remain unverified; no
measurements or shipping selection. Single pinned runtime lock and Core unchanged.
START-HERE supersedes older pending32 instructions. No new installs/app/vault changes.

## Matched build34 / P-36 checkpoint — 2026-11-16

User33 commit5bbd7f10, actual Mac tools supplied. No more inventory request.
Next apply34 and run runtime-qualification/build34/run.mjs; get Mac build summary/
error before GUI tests/benchmarks.7 support +80 runtime +strict TS pass in Linux,
not Mac compilation. Same Core resources/prepareClose across three host wrappers,
outputs Git-internal, smoke Spaces new/factory-only, old NC28 sessions untouched.
Product P-36 CONFIRMED: one integration connection/user-device, default all current
and future local Spaces, optional advanced restrictions; no separate Space codes
or repetitive prompts. Per-Space writers/internal transport handles stay separate.
See local-security-api-spec and integration-access-cases; no production auth pass.
START-HERE is current; do not repeat generic metadata or broad native editor suite.

Current P-37 greenfield scope supersedes older migration/cutover wording in historical records; see greenfield-scope.md.
