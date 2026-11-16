# Native memory counter and package accounting38

GUI37 basic checks passed for all candidates (screenshots + user confirmations).
This stage prepares measurement instruments; it is not the measured comparison.

```bash
node docs/foundation/runtime-qualification/instruments38/prepare.mjs --run 2026-11-16T10-35-45-751Z-5b4941c3
```

The runner verifies the completed36 profile/input graph, every signed app's tree,
common Core tree, strict codesign, verified retained archive ancestry and ZIP SHA.
It reports compressed ZIP bytes and installed logical/allocated bytes for H-S/E/T,
including all bundled runtimes/helpers/resources/licenses. No caches/source/fixture
are silently counted as shipping bytes; those are separate and not measured here.
Signed ad-hoc experiment ZIPs are not notarized shipping distributions. Required
OS WebKit dependencies are disclosed as OS-provided and have no bundled byte cost;
that does not make their runtime memory free. BH03/04 values are read from frozen
H01, never duplicated as a second budget source. A size excess is preserved.

The app walk never follows symlinks; all aliases must resolve inside the bundle.
Logical bytes count each non-directory entry including symlink target names;
reported allocation sums st_blocks*512 once per device/inode including directories.
Hardlinks are not double-counted for allocation. APFS clone/shared/compressed extent
ownership cannot be inferred; this is not a unique physical-volume size claim.

A separate small C instrument is compiled with the existing Mac SDK, with source,
compiler/flags/SDK/binary hashes and private logs under Git-internal qualification
outputs. It creates one temporary child, reads that child's native physical-
footprint counter externally, asks it to map/touch64MiB, reads again, releases it,
and reads before exit. Stable process-start identity is required. A>=48MiB rise is
only a counter sanity tolerance, not a Clutter budget. Release is recorded without
requiring an instantaneous decrease or inferring a leak. The child exits normally
or is cleaned up by its parent; a15s child alarm bounds orphan lifetime. Only that
new child can be signalled, never an app/owner process. No sudo or permission change.

The command never opens UI, starts/stops an owner, reads an endpoint/token, writes
any Space, changes a signed app, downloads tools or modifies global settings.
No old manual tests need repeating. Unsupported Linux stops before build access;
its C refusal branch is tested and is not a Mac compile or footprint validation.
9 Linux helper tests pass. Actual Mac compile/calibration/sizes remain pending.

Paste terminal JSON. If calibration is inconclusive/fails, raw output is retained
and memory ranking stays blocked. No RSS/JS heap fallback. A successful calibration
still does not qualify aggregate memory: native renderer/GPU/network/helper and
shared WebKit attribution must be validated before HP measurements. The prototype
page is not HP10/HP1K/HP10K; its memory is not used to pass those workload budgets.

Responsiveness plan: validate actual native presentation/input evidence and clock
correlation against visible events before sampling; JS transaction, RAF and native
Ready callbacks cannot stand in for displayed pixels. Font/display/power and fixture
bindings remain prerequisites. No responsiveness numbers are emitted by38. Next
work uses the returned counter/accounting result to validate attributed sampling
and native presentation feasibility, then run the frozen comparable workload plan.
Missing mandatory evidence produces a specific blocked disposition, not a winner.

API references checked2026-11-16: Apple libproc.h and rusage_info_v4 plus memory
instrumentation documentation; exact URLs in evidence/host-instruments-38 sources.
Installed SDK compile, not current online headers, determines actual availability.
