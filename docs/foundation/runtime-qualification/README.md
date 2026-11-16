# H01 — production host/runtime qualification

Revision0.56, 2026-11-16. [contract.json](contract.json) is the normative source for
candidate families, fixtures, cases, trial thresholds, comparison policy and exit
dispositions. Candidate versions, reference-host binding and instrumentation are
still pending; no benchmark, built candidate or production selection is claimed.

I1 completed the disposable integration round. H01 fixes the bounded comparison for
the shipping host: same TypeScript Core, PM/Y binding and separately packaged Node
SpaceService for each first-round candidate. UI/CLI/MCP stay peer clients. No domain
rule moves to Rust/Swift or a launcher. The full current app/editor implementation
has zero selection weight; it is not a target constraint. Windows runtime can follow,
but its interfaces/module/path contracts must already fit the design.

| Candidate | First controlled configuration | Role |
| --- | --- | --- |
| H-T | Tauri2 system webview + Rust mechanisms + common independent Node owner | Shortlist |
| H-E | Electron renderer/native mechanisms + same independent Node owner | Shortlist |
| H-S | Swift AppKit/WK + same independent Node owner | Eligible control/fallback |

These are Clutter candidate designs, not assertions that a framework's sidecar API
already implements independent lifetime, authentication, safe updates or store
fencing. Electron's embedded runtime AND the independent owner both count. This
controlled H-E configuration is not claimed to be the smallest possible Electron
architecture. An optimized integrated owner requires its own candidate ID and
lifetime/storage proof before measurements can transfer. No framework wins from
marketing size claims, prior implementation or the old116.19MiB Node Git blob.

## What is fixed and what is still open

The JSON defines twelve correctness/evidence cases, three Space-size profiles and
five additional host trial targets. Original B-01…08 values are referenced from the
unchanged [budget source](../qualification-budgets.json), not copied/redefined.
New targets are engineering comparison gates, not measured results or product SLA.
Changing a target after seeing results requires a new version/reason/comparable run.

HP-10/1K/10K explicitly add page counts, task pages, active Spaces and windows. They
use supported paragraph pages + the same tiny PNG/PDF fixtures. They do NOT implement
or qualify full mixed table/typed-property/inline-media product workloads. Full old
W-TYPICAL/W-LARGE/D11 scale evidence remains required before related real-data/
release acceptance. Missing instrumentation/unsupported workload is BLOCKED or FAIL,
not a convenient substitute metric or an invented pass.

A candidate must prove standalone installed CLI/MCP startup, one canonical writer,
protected lifecycle, narrow authenticated bridge, bounded framing, actual native
mechanisms, coherent four-view routing and comparable aggregate measurements.
Gate-specific detail is in JSON H-01…12. No dedicated background service is required
when all clients/work are idle. A locator owns discovery only, never document policy.

Selection for the next disposable implementation can be conditional when release-
only signing/notarization/update credentials are unavailable, with exact blocked
items recorded. Offline packaged startup, private bridge/integrity and mandatory
correctness/measurements cannot be waived. Real-vault format/migration/native flush/
security and shipping gates remain blocking. No app migration or production route
is enabled by this document. Final ADR must map the rules it supersedes explicitly.

## Next action — capture reference-host facts

After applying32 on the foundation branch, from repo root run:

```bash
node docs/foundation/runtime-qualification/host-inventory.mjs
```

Paste the JSON. It collects chip/model, RAM, architecture and OS version/build only
plus the inventory runner's Node version and required remaining metadata. No serial,
username, hostname, environment, tokens, private endpoint, vault or app is read.
It archives facts inside Git metadata, not source, and refuses another branch.
This is not a benchmark, disk inspection, machine approval or native qualification.
Linux run is a separately labelled unsupported reference inventory, not a Mac result.

Then bind the actual Mac profile and exact candidate/toolchain/instrumentation pins
before timed runs. Display/font/power/volume/instruments are not auto-invented from
hardware facts. No framework install/runtime download/build/new session is needed
for32. Do not replay NC28 or disturb its service/store/report.

## Bounded path to the decision

Contract32 → host/version/instrument preflight33 → matched shell builds34 → measured
comparison35 → scoped ADR36 (or a specific blocked/failed disposition). These are
work stages, not elapsed-time promises. No unbounded new framework research or
reimplementation of editor semantics. Diagnose failures within the fixed contract;
do not lower its guarantees to force a winner. Reference results retain raw attempts.

## Primary-source basis (checked 2026-11-16)

- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model):
  main/renderer/utility roles; a utility process API alone is not evidence of an
  app-independent service. Detached lifetime is a Clutter requirement to test.
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security):
  isolated/sandboxed renderer and narrow privileged bridge guide the host check.
- [Tauri external binaries](https://v2.tauri.app/develop/sidecar/): packaged external
  binaries are an available mechanism; lifecycle/identity must still be proven.
- [Tauri Node sidecar](https://v2.tauri.app/learn/sidecar-nodejs/): Node packaging is
  a documented option, not proof that the renderer is a headless Core runtime.
- [Tauri webviews](https://v2.tauri.app/reference/webview-versions/): system webview
  versions vary with the platform, so exact OS/webview versions enter run manifests.

Those documents support mechanism availability only. All candidate suitability,
size/performance/lifecycle conclusions require the actual H01 evidence.

## Current step — preflight33 (supersedes initial inventory request)

User applied32 as44c624ac and supplied Mac16,7/M4 Pro,48GiB,14 logical CPUs,macOS
26.6.2 build25G83,untranslated arm64. Hardware evidence is bound in
[preflight-manifest.json](preflight-manifest.json); remaining environment/versions/
instrument readiness is unproven. This48GiB machine is not16GiB performance evidence.
Do not request host-inventory.mjs again or repeat NC28. Host Node24.11 is only a
metadata runner; common Core runtime still resolves from the existing pinned lock.

After apply33, run `node docs/foundation/runtime-qualification/run-preflight.mjs`
and paste JSON. It probes existing Xcode/Swift/SDK, already-installed Rust toolchain,
xctrace/template/tool availability, sanitized display/power/volume/WebKit facts.
No installs/updates/downloads/compilation/app launch/system changes or vault access.
Progress labels go to stderr, safe JSON to stdout and Git-internal archive. Missing
commands/permissions produce unavailable fields, never a pass. It does not request
sudo or silently use JS heap/RSS/RAF as missing metric replacements.

The exact version choices live only in preflight-manifest.json. Complete dependency
locks/checksums/license notices and compatibility are still pending isolated build;
framework version metadata is not a binary integrity check. Official release checksum
retrieval was unavailable in agent web tooling, so values remain unclaimed. Before
any timing all binary/source/fixture pins and actual font/display/power/volume +
physical-footprint/presentation instruments must be validated, as H01 already requires.

Next after this output: matched isolated builds34 using actual reported tools. Do
not introduce another generic inventory round, alter contract32 thresholds, replace
Node from the user's PATH for Core execution, or claim any performance result.
