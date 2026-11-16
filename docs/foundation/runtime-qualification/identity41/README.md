# Verified executable aliases41

Current42: actual41 capture/export succeeds; TOC has79 tables/51 schemas. Next is
existing trace export in ../trace42/README.md, with no recording or open UI required.
Earlier next-record instructions below are historical; preserve source trace.


User40 actual diagnostic:16 WebKit path-before mismatches, no failed native API
stage. User's independent read-only check then confirms ALL16 paths resolve to the
same canonical path and stable file identity (dev/inode/size/ctimeNs). This supports
a narrow correction to diagnostic matching, not broader OS permissions or Core
ownership/security changes. Native APIs were already returning valid samples.

Keep H-T qualification window open and run after apply41:

```bash
node docs/foundation/runtime-qualification/instruments39/capture.mjs --run 2026-11-16T10-35-45-751Z-5b4941c3 --candidate H-T
```

The existing capture records fresh data in a new Git-internal directory, preserves
old traces/logs, and uses40's graceful trace interrupt/finalization. No new app build,
Space, owner startup, permissions workaround or repeated manual editing requested.
The separate probe still compiles from unchanged40 native source. Return safe JSON.

One executableMatch helper owns the new rule. Original exact absolute path matches
are preserved. Differing paths must both identify regular files, agree on canonical
realpath AND dev/inode/size/ctimeNs, and retain both identities across repeated
reads. A matching basename/content hash or inode alone is insufficient. Distinct
hardlink names without identical canonical paths are deliberately not accepted by
this narrow, evidence-supported alias policy. Missing/inaccessible/dangling paths,
directories or changed identities refuse. Per-process before/after image matches,
UID/start ticks and numeric physical-counter guards remain mandatory.

The sanitizer reports match METHOD only, never filesystem paths or arbitrary error
messages. This diagnostic is not a defense against hostile OS-user races, loaded-
image/code-signing attestation, peer authentication, or Space writer fencing. Those
remain independent H01 requirements. No shared Core/UI module imports this OS helper.

24 Linux tests pass:7 new real filesystem/whole-sanitizer checks and17 counter/
framing/graceful trace regressions. Actual Mac41 capture remains not-run. Accepting
confirmed path aliases resolves these invalid exclusions; it does NOT prove which
WebKit services belong to Clutter, eliminate shared-page accounting, establish HP
fixture memory limits, validate native input-to-display timing, or select a host.
Tauri/Electron still share one UI/Core; Swift comparison, Mac first, Windows/browser
ports and no legacy-data migration requirements remain unchanged.
