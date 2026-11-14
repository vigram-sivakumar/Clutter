# Joined Origin editor and durable owner proof

Revision0.39. Read [current result](../../../r08-joined-core.md) and [frozen codec/
transition boundary](FORMAT.md). The unchanged [JG contract](../../../joined-core-contract.json)
was frozen as not-run in0.38; its execution results are separate evidence.

From the experiment package directory, run `npm run test:joined`. Install the
existing locked dependencies and Playwright browser as described in the parent
README. A compatible Node built-in SQLite profile is required; the executed Linux
profile is recorded in the report. `CHROMIUM_EXECUTABLE` selects an existing
Chromium. No new dependency or production build is involved.

The runner starts an independent child owner, opens two actual PM EditorViews,
launches real CLI/MCP children, injects faults through parent IPC and uses SIGKILL
at observed application phases. The driver does not own accepted documents or
write a second store. Store/host code is shared with the earlier18-case proof;
its default snapshot profile is still independently regression tested.

`joined/owner.mjs --store PATH --init` requires a new empty marked test directory.
Normal open never initializes a missing/corrupt root. Tests retain temporary stores
for diagnosis. Connection descriptors are delivered only through launcher IPC.
The browser receives synthetic capabilities via a removed URL fragment. No
production endpoint discovery, grant issuance or installed headless launch is
implemented here. Restart tests use the same HTTP origin with rotated credentials.

The CLI uses the existing `durable/cli.mjs` thin transport and the shared owner
command path. The joined MCP wrapper shares `src/mcp-stdio.mjs` framing and the
same transport; it exposes the bounded semantic command subset, not raw Y updates.
`window.joined.rpc` is the stable synthetic command surface; `originLab` retains
view/selection/history test helpers. Its old ephemeral liveCommand is not the
new durable API. Never use a session token as durable operation identity.

Pending editing contexts/undo mechanics are client-side and outlive EditorViews;
SQL accepted state belongs solely to the owner. Closing an actual view invokes
full pending protection first. Closing the browser process/window is not handled
by this harness and is part of native lifecycle qualification. Interactive undo
stacks are deliberately not serialized across owner restart; document versions,
pins and protected work have separate durable roles.

The fixture does not qualify production task storage, stable block identity,
external image/PDF publication, provider sync, GC/migrations or performance.
There is one table for structural pending-scope binding. Exact Windows/macOS and
OS/power/VFS guarantees do not follow from Linux browser/process tests.
