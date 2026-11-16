# Existing candidate GUI launch37

Build36 reports all three candidates built/signed/strict verified with packaged
CLI/MCP smoke pass. This launcher does not rebuild or modify signed apps.

First action on the reference Mac, from the foundation branch:

```bash
node docs/foundation/runtime-qualification/build34/launch.mjs --run 2026-11-16T10-35-45-751Z-5b4941c3 --candidate H-S
```

Confirm the Swift window reaches Ready and both views show Alpha beta. Stop there
and report what appears. No typing/history/media/fault tests requested yet.
H-E/H-T support the same explicit candidate argument but are not the next action.
The window title may still say build smoke; the retained app was not rebuilt.

Reports/locators/logs live under Git-internal clutter-host-qualification/gui.
Each candidate gets its own disposable factory Space, separate from NC28/old labs
and real vaults. Launching twice refuses an existing live UI. After closing, use
exactly the same command with --reopen to preserve that candidate's Space.
--new explicitly creates another disposable Space; never use it for recovery.
Missing/corrupt state refuses rather than silently resetting. UI PID checks are
operational duplicate-window checks, not new Core writer-fencing guarantees.

Artifact tree/common bytes and strict codesign are verified before launch. Shared
factory session/owner/bootstrap/prepareClose are reused. A fresh bootstrap nonce
and private file are created on reopen. Do not share endpoint or private config
files: they contain credentials. No global toolchain changes, main changes or
legacy-data migration. Generated files must never be git-added.

The 30-second readiness wait is operational, not a startup/presentation metric.
A native ready callback still needs visual confirmation.20 Linux support tests
pass; this does not qualify Mac GUI, physical footprint, font/presentation probes,
PDF bridge, full product feature coverage, installed lifecycle/security or host
performance. No candidate winner is inferred.
