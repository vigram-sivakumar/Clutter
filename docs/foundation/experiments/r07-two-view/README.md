# R07 two-view editing experiment

A standalone, disposable candidate under `docs/foundation/`. No production imports,
vault access, root dependency changes or architecture selection. All example text
is synthetic. Read the preserved [first findings](findings.md) and [second-slice findings](follow-up-findings.md) before interpreting results.

## Run

From the repository root:

```bash
cd docs/foundation/experiments/r07-two-view
npm ci --ignore-scripts --workspaces=false
npm test
npm run build
npm run serve
```

Open `http://127.0.0.1:4178`. Both panes edit the same accepted document through a
local authority, with separate selections/context history. Try alternating edits,
Undo/Redo, external edit, view close/reopen and save/recovery failure switches.
The original-page button exposes an unsupported projection; it does not pretend
to open a real page. The browser writes only prefixed experiment localStorage.
Never type private/important work into this lab; it records synthetic event traces.

For browser checks, install the pinned Playwright Chromium if needed:

```bash
npx playwright install chromium
npm run test:browser
```

The observed Linux run used Chromium 153.0.8010.0 through an explicit
`CHROMIUM_EXECUTABLE`; use that environment variable to record a chosen installed
browser. The runner uses container-only sandbox flags on Linux; these are test
launch options, not a deployment security configuration. Browser checks are not
macOS/WKWebView/native input qualification. Real IME/VoiceOver are not simulated.

The default `/` route now uses the public selection preflight candidate. The
browser runner checks candidate cases plus `/control` (unchanged raw failure) and
`/control?selection=public` (adapted control). Raw failure stays visible in results;
only candidate/adapted-control failures cause the candidate suite to fail. This is
not a relabelled acceptance pass for the raw control. The `/?selection=raw` route
also disables the adapter in the original two-view composition.

For the separate origin-aware history comparison, open `http://127.0.0.1:4178/origin`
or run:

```bash
npm run test:origin
```

That comparison uses Yjs only for local representation/origin history. It has no
cloud service, persistence or live CLI/MCP bridge. It preserves foreign batched
text through actual undo and redo; it does not select a production CRDT/store.
The old guard and raw failure reproduction remain available unchanged.

`BROWSER_CASE=BR-14` isolates the table case. Artifacts include snapshots/traces;
`node manifest.mjs` records exact sources/locks. Generated output stays ignored.
No sleeps were added to immediate-input actions. Synthetic composition-flag guards
are not native IME proof. See the follow-up findings for all remaining gaps.

## Headless adapter demonstration

CLI reads one JSON command from stdin. MCP pins the reviewed 2025-11-25 stdio subset
(initialize, ping, tools/list and one lab tool). Both use the same `execute()` and
FileStore authority; no frontend is required. They are **not connected live to the
browser authority**. No production command naming, grant/security or IPC contract
is being ratified. MCP is a bounded test adapter, not a conformance-certified server.

```bash
printf '%s\n' '{"method":"read"}' | node cli.mjs --store '/tmp/clutter-r07-demo'
printf '%s\n' '{"method":"insert","id":"demo-1","version":0,"target":"Alpha","text":"Hello "}' | node cli.mjs --store '/tmp/clutter-r07-demo'
```

Use only a new empty experiment directory. The marker refuses existing unmarked
content. Files contain the synthetic snapshot/recovery log; no Markdown note is
modified. A live owner or leftover lock refuses access. Automatic stale-lock
removal/takeover is intentionally absent; use a fresh directory after an experiment
crash rather than deleting locks around a live process. No shared DB/provider folder.

## Architecture and limits

- `src/authority.mjs`: step admission, batch validation, outcomes and accepted/durable
  state; deduplication before stale guard. Maximum 10,000 steps and 1 MiB document.
- `src/context.mjs`: explicit origin, provisional steps, mapped state, context history
  and recovery checkpoints. The UI persists synthetic client backups separately.
- `src/history-guard.mjs`: separate conservative candidate; raw failure remains tested.
- `src/file-store.mjs`: isolated snapshot/recovery experiment, including directory
  flush and latest snapshot versus stale rescue selection. Not storage selection.
- `src/api.mjs`, `cli.mjs`, `mcp.mjs`: one dispatcher and thin process adapters.
- `src/control.mjs`: raw one-view control; no coordination/collab layer.

The core suite's green result includes one diagnostic that **confirms the raw
candidate violates the undo requirement**. It is not a count of passing product acceptance
cases. The guard is intentionally broad for foreign mark/attribute changes, replays
an uncompressed step log and is not performance-qualified. A refusal does not
advance undo history or delete work; it does not prove a satisfactory final UX.
Task page projection, stable block IDs, full schema/lifecycle, media and native
platform work remain gaps. Read the candidate manifest and qualification report.

## Primary references checked 2026-11-14

- [ProseMirror collaboration guide](https://prosemirror.net/docs/guide/#collab)
- [Upstream paste advisory, fixed in view 1.42.3](https://github.com/ProseMirror/prosemirror-view/security/advisories/GHSA-c8x8-7fp4-3x9w)
- [MCP reference transport revision](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

Pinned view 1.42.9 exceeds the advisory's fixed version; npm audit reported no known
vulnerabilities for this lock at review time. Neither observation proves security.

The origin candidate and selection preflight are separate comparisons. Core/API
parity, durable snapshots and safe-close tests from the first candidate do not
qualify those missing features in the origin candidate by association.
