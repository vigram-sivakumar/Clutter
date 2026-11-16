# Process counter and native trace diagnostic39

Current40 correction: actual39 trace finalization timed out and partial export failed.
Do not rerun this full recording yet. Follow ../recovery40/README.md for one read-only
failure-stage diagnostic. Future recordings now use SIGINT12s then bounded CLI-only
escalation27/30s, with independent export attempt; old25s wording below is historical.


User38 actual Mac compile and cross-process64MiB counter sanity pass. All three
experimental package sizes are within fixed limits. P-38/P-39 now require one shared
UI/Core with explicit platform adapters: Tauri/Electron shortlist, Swift control.
No mandatory metric, threshold, artifact or source pin is changed by that decision.

Close any qualification windows first. Reopen the existing Tauri Space, then run:

```bash
node docs/foundation/runtime-qualification/build34/launch.mjs --run 2026-11-16T10-35-45-751Z-5b4941c3 --candidate H-T --reopen &&
node docs/foundation/runtime-qualification/instruments39/capture.mjs --run 2026-11-16T10-35-45-751Z-5b4941c3 --candidate H-T
```

Leave that window open. No typing/fault/manual suite is needed. Paste the final
safe JSON. Capture verifies the completed build/common/app hashes and strict
signature, binds the GUI37 locator to that artifact, and refuses a missing/wrong UI.
It cannot launch an owner, reset a fixture, read endpoint tokens or open the vault.
A separate diagnostic executable compiles under the existing SDK and includes the
already-calibrated38 implementation; no second definition of the OS counter/API.
Its fresh child sanity test validates this new executable, not another product test.

## What is captured

Three short read-only process snapshots precede tracing. An OS process listing
(no arguments/environment) selects the candidate app, its separately packaged Node
owner, observed descendants and all same-user system WebKit executable matches.
The native reader checks process-start identity around executable-path/physical-
footprint reads. Node checks the image/user against the fresh process listing.
PIDs/start ticks identify diagnostic samples, never Core writer ownership/fencing.

Only roles/PIDs/start ticks/physical byte counters and uncertainty enter the
shareable report. Full executable paths from OS/C remain transient and are not
persisted by the snapshot path. Raw listing is never printed or saved. Private
compiler/Instruments logs and traces may include local paths/OS profiling metadata;
keep them local; do not send them blindly. No content/endpoints/tokens are read.

System WebKit services can be reparented/shared. Include all matching same-user
services as uncertain possible costs, even from other apps, rather than calling
unattributed renderers/GPU/network free. Parent descendants add evidence, not proof
of all processes. Missing/inaccessible/exited/changed PIDs are explicit unavailable;
totals become null. Membership changes during a read also invalidate total fields.
Multiple bundled Node instances remain visible as contamination, not one owner.

Known-process sums and sums including uncertain WebKit are diagnostic only. They
are not rigorous lower/upper bounds: shared-page charges may be counted multiple
times, unrelated WebKit may be included, and unrecognized helpers can be absent.
The report always says ranking not qualified. No HP workload or memory budget pass.
Zero WebKit matches or a stable PID set cannot establish complete attribution.

## Native presentation feasibility

After memory snapshots (never mixed with profiling overhead), the runner checks
installed `xctrace help record` for the intended noninteractive interface, then
attempts one5s Animation Hitches attach to this UI and exports its table of contents.
The recording subprocess has a25s timeout, export15s; no sudo/setting changes or
permission workaround. Failed/refused/timed-out attach/export is explicitly blocked,
with private logs/partial artifacts retained. No GUI or owner is intentionally
terminated. The tool uses attach, never launch/kill-target. No all-process recording.

Schema inventory is not latency data. An idle trace may be empty; successful export
or existence of User Events/Frame Lifetimes/etc does not establish input-to-physical-
presentation correlation or common clock validity. No responsiveness numbers are
emitted, no JS heap/RSS/RAF/native Ready substitute. Actual frame/event mapping,
shared-process/coalition accounting and frozen fixture/font/display/power bindings
must close before comparative performance samples. H01 remains hash-stable.

10 new Linux tests pass (including real non-Mac C refusal compilation); Mac39
compile, process sample and trace acquisition are not yet run. Candidate capture
starts with H-T only; H-E next after inspecting returned results. No further Swift
UI work is introduced. No background global installs, package changes, old manual
replay, real-data changes, migration work, host selection or shipping claim.
