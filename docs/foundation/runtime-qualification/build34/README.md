# Matched host build-smoke34

Build the three H01 configurations around one shared Core/browser resource pack.
[Contract](../contract.json), [pins](../preflight-manifest.json),
[actual Mac preflight](../../evidence/host-build-34-2026-11-16/user-mac-preflight.json).
This is build preparation, not a shipping host choice or benchmark runner.

From foundation branch/repository root after applying34:

```bash
node docs/foundation/runtime-qualification/build34/run.mjs
```

Verified runtime extraction and fresh smoke stores use separate private OS-temp
directories; persistent caches/apps/logs remain Git-internal. Neither is source staging.

First use may download the checksum-pinned Node runtime, verified Electron archive
and isolated npm/Cargo dependencies, then compile Swift and Rust. It prints progress
while commands run. No global framework/toolchain install/update and no production
app changes. It creates new marked OS-temp smoke Spaces only, reads them through
the same packaged CLI and MCP, and stops those newly created services afterwards.
No GUI window is opened. Do not run old native labs or --new for this build step.

All apps, dependency locks, caches, build logs, licenses/notices, hashes and reports
live under Git-internal clutter-host-qualification. They cannot be staged on any
branch. Earlier NC28 session/store/report/locator stays untouched. The common signed
Node and exact same CoreData bytes are copied after native packaging, then outer
app signatures verified. Full npm/Cargo lock hashes are recorded before code builds;
locks must remain unchanged and Cargo build stays locked/offline after fetch.
Electron archive checksum admission occurs before extraction. Missing releases/
checksums/compiler compatibility cause explicit failure; no invented SHA/downgrade.

The small browser event-hook seam keeps the old WK core28 fallback and all existing
editor/history/API behavior. Shell adapters handle only bootstrap/navigation/focus/
window lifecycle, calling the SAME renderer prepareClose. Electron renderer has no
Node integration and uses a limited isolated preload. Tauri exposes no app commands,
plugins or renderer capabilities; its boot/event port is bounded and origin-bound.
These mechanisms are fixture scope, not production peer-auth/identity proof.

Build order is Swift control, Electron, Tauri. Each result is independently retained;
one failure does not silently select another winner. Paste the final JSON summary
(or first compiler/download error). The report contains paths/hashes/Space IDs, not
private bootstrap tokens. Do not share host34-private.json or endpoint.json.

## Explicit scope limits

- GUI launch and changed-host native interaction are NOT executed by this command.
- Smoke data is one paragraph; not the HP scale or mixed-product D11 fixtures.
- Native PDF preview is intentionally unavailable in these build-only wrappers;
  clicking it in a later launch reports unqualified, never a pass. Existing NC28 PDF
  manual pass remains for its original host. Do not claim H-10 for34.
- No installed production CLI discovery/auth/enrollment, OS grant/alias fencing,
  complete native flush, notarization/security/update or benchmarks accepted.
- Current120Hz/power/thermal/footprint instrument facts remain measurement inputs,
  not presentation/physical-footprint proof. No heap/RSS/RAF substitutions.
- Qualification resources still use internal Space-bound private transport handles;
  confirmed P-36 one-time/all-Spaces user access is a product requirement to implement,
  not per-Space codes imposed by these internal handles.

After successful Mac builds,35 can launch changed hosts with controlled private
bootstrap and gather actual readiness/lifecycle/instrument evidence. Do not replay
the old broad editor suite. The source keeps the single Core and Windows seams;
this Mac-only wrapper build does not claim Windows runtime qualification.

## Current correction — retry35 over original34

User34 commit8ed5331c: H-S built/signed/strict-verified and packaged CLI/MCP smoke
passed. H-E failed nested Electron Framework signature verification; H-T macro
failed because generated project omitted icons/icon.png. No GUI/benchmark run.

After apply35, retry ONLY the failed candidates while keeping original artifacts:

```bash
node docs/foundation/runtime-qualification/build34/run.mjs --retry 2026-11-16T09-58-25-103Z-7838dcfb
```

Retry verifies original common/source/artifact/lock/checksum hashes. It re-verifies
the passed Swift signature/archive, reuses identical common CoreData and copies the
original npm/Cargo locks (no new resolution). Failed candidates rebuild in a NEW
run directory using prior caches. Original build/report/signatures/failures stay
untouched. If inputs changed, retry refuses rather than mixing evidence; report
that error instead of resetting/deleting anything or bypassing checks.

Tauri now receives its explicitly configured valid RGBA icon. Electron receives
explicit inside-out Mach-O/nested bundle signing with signature metadata preserved;
CoreData node is excluded and its hash must remain identical. Outer app last, deep
strict verification stays mandatory. Symlink escape/ambiguous framework versions
refuse; no `--deep` force signing or removal of resource verification. Actual Mac
results after these fixes remain pending; Linux12 tests only cover support logic.

## Current correction36 — preserve both passes, retry only Tauri

User35 commit476e7f71/run2026-11-16T10-19-43-465Z-627d2e3f: Swift retained/verified
PASS; Electron actual nested signing/strict verify/CLI+MCP smoke PASS; Tauri stopped
before compile. User diagnostic proves CLI wrote equivalent inline-table versions
with empty features. The generator now emits those EXACT observed Cargo bytes; full
manifest comparison and all pin/lock checks stay strict, not skipped/loosened.

```bash
node docs/foundation/runtime-qualification/build34/run.mjs --retry 2026-11-16T10-19-43-465Z-627d2e3f
```

Latest35 has no copied Tauri locks because it stopped before copying them, and its
Swift archive still lives in original34. Retry36 follows verified parent report
hashes/profile and artifact records to find those original files, reuses both passed
apps, and rebuilds only Tauri with original34 dependency locks. No new dependency
resolution or alteration of old outputs. Modified ancestor reports/lock bytes refuse.
15 support tests pass, including actual user Cargo normalization and partial retry
regressions. Mac Tauri compilation after36 remains not-run until this command.
No GUI/benchmark/old native replay or another inventory needed.
