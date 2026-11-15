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

## Native macOS host

The [Mac guide](native-macos/README.md) gives build/run commands and the built-in
manual checklist. `npm run native:mac` builds a separate AppKit/WKWebView .app and
saves reports locally. Swift compilation/native launch is not verified on the
current Linux host. Automatic fixture checks are separate from native observations.

## Confirmed table profile (patches 05–09)

[Table contract](../../table-interaction-contract.md) supersedes earlier table
defaults. Enter moves down the same column and stops at the bottom. Shift+Enter
inserts an in-cell hard break. Tab/Shift+Tab arrive at cell text end; final Tab
stays put. Bottom/right handles append a row/column explicitly. Clicking a cell
highlights it with a caret; Escape keeps that cell selected without a caret.
Selected-cell Tab/Shift+Tab move only the highlight; Enter returns to editing.
Triple-click selects all text inside the cell, not a structural cell selection.
The old Escape-to-handle shortcut is removed. Adding either axis preserves the original active
cell, caret/selection and focus. No navigation command creates structure.

Run `npm run test:tables` for both candidates. Table navigation, handle operations
and safety checks are separated from the explicitly failing unguarded structural
history controls. `/origin?history=raw` is a diagnostic-only route; the default
origin comparison refuses table-handle undo/redo after foreign changes. This
conservative guard may refuse safe disjoint inverses and is not final semantic undo.

Original minimal controls now import `legacy-table-command.mjs` and retain their
old exploratory behaviour for reproduction. They do not define current acceptance.
Use [native progress](../../NATIVE-TEST-PROGRESS.md) for observed versus pending
Mac work, and retest the revised NM-01 after quitting/rebuilding the old host.

## Matched history and live commands (bundle11)

Read [comparison](../../r07-matched-comparison.md) and
[case contract](matched-comparison-contract.json). npm run test:comparison runs
both candidates using identical semantic fixtures. It launches real live-cli.mjs
and live-mcp.mjs processes; the authenticated loopback Playwright relay delivers
to the browser's liveCommand entry and owns no document. Legacy command and
file-store adapters remain intact as prior evidence, not another production API.

Discovery exit 0 means execution completed without unexpected failure, not that
every case applied its inverse. Pass, explicit refusal and gap are separate.
Build 11 npm run test:comparison -- --strict exited 1 on the recorded disjoint
refusals/lifecycle gap. Build 12 now passes the unchanged contract; see the current
[ownership fix](../../r07-history-ownership.md). Reports go to ignored artifacts/comparison-results.json;
retained evidence keeps discovery and strict runs separately.

Origin recreateView is a destructive public lifecycle probe. Build 11 exposed lost
redo/new-edit tracking; build 12 keeps history in the authority-owned context.
No production close/reopen feature is claimed. All receipts/storage are ephemeral. This is not
app IPC, disk recovery, a Clutter server requirement or full MCP conformance.
No manual retest is requested for this automation slice. Headless inputs use
synthetic string targets; stable product IDs/security/durability remain separate.

## Context-owned history (patch 12)

[Current results](../../r07-history-ownership.md) close the three strict gates
without changing matched-comparison-contract.json. npm run test:history-lifecycle
adds repeated A/B remounts, closed-view foreign delivery, paused provisional edits,
scoped guard undo/redo and selected-cell mode checks. Normal cases pass; the raw
route deliberately retains the old redo failure and is not a passing product test.
Context history/bookmarks use public APIs and never retain an EditorView/binding.
The accepted change journal contains ranges/origins, not duplicate documents.
No new dependency/lock/native source changed; no native12 result claimed.

## Separate durable-owner proof (build13)

See [durable fixture](durable/README.md) and [qualification](../../r07-durable-authority.md).
18 bounded Linux cases pass against a real exclusive SQLite owner shared by
browser projections, CLI and MCP. This is separate from the full PM/Y candidates;
it does not persist their editing contexts/undo histories. Existing matched strict
contract and Node regressions pass. Next R08 review proposes complete combinations
and remaining joined/native gates. No production architecture accepted.

## Joined full-editor/durable-owner proof (build15)

[Joined runner](joined/README.md), [codec/transition boundary](joined/FORMAT.md)
and [result](../../r08-joined-core.md): JG-01–10 pass on Linux. This uses actual
PM/Y EditorViews and a real separate owner, not the earlier read-only browser
projections. Shared Store/host and stable CLI/MCP operations commit one accepted
Y root with its outcome. Native/installed JG-11 and entity/external assets12/13
remain explicit gates. No new manual session or selected production stack.

## New joined Mac runner16

Use [joined-native guide](joined-native/README.md), not native:mac, for the actual
joined candidate. npm run native:joined packages a pinned runtime and starts a
separate Swift/WK host after headless checks. Native build/run is not-run here;
8 Linux helper checks do not pass JG-11. Start JN-01 only when the new window is ready.

## Canonical task entity/placement proof (build21)

[Entity contract](entities/CONTRACT.md) and [result](../../r08-entity-closure.md):
`npm run test:entities` runs14 bounded Linux cases through the same Store/host,
existing CLI transport and thin entity MCP schema wrapper. No browser is required.
Notes contain placement slots, not copied task bodies/properties. Multi-note moves
commit as one Y root/receipt; historical ownership conflicts refuse restoration.
This is separate from earlier native editor binding; prior user manual passes stay
valid. Next JG13 external files, not more native keyboard retesting.

## External image/PDF closure (build22)

[Media guide](media/README.md), [frozen protocol](media/CONTRACT.md) and
[result](../../r08-media-closure.md). `npm run test:media` exercises external
publication/pins/retries/crashes; `npm run test:media-ports` checks shared Store
compatibility headlessly.12 media cases/13 process-death phases pass. Notes and
tasks use the same body/cover association operations; actual media rendering is
not qualified here. Prior manual passes remain. Next decision-readiness review.
