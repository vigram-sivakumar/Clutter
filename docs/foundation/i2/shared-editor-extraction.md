# I2b shared editor extraction — delivery47

The current PM/Y implementation now lives in packages/foundation-runtime/src/editor.
No shared runtime source imports docs/experiments or hardcoded node_modules paths.
No session, Core, semantic operation, authority, storage writer or recovery reducer
was added. Module/function executable bodies match qualified sources after import
and comment normalization (source audit in47 evidence).

## Entry and responsibility

| Entry/module | Responsibility |
| --- | --- |
| @clutter/foundation-runtime | Portable Core/client/session/contracts, unchanged |
| @clutter/foundation-runtime/editor/browser | Actual replica, browser codec, schema, origin history; browser-safe bundle |
| @clutter/foundation-runtime/editor/backend | Existing bounded engine and hash-checked page codec; backend only |
| @clutter/foundation-runtime/editor/schema | Current supported schema; no backend/OS dependency |
| editor/page-model.mjs | Extracted page/property validation and PM/Y body/property update mechanics |
| editor/qualified-replica.mjs | Node test composition with backend hash-verifying codec; not the browser entry |

I1 qualified engine/editor/replica/browser-codec paths are re-exports of these same
modules. Its native pack's browser-boundary guard now also recognizes the extracted
backend filenames. Integration tests/crash workers import canonical runtime modules.
No new desktop shell or UI event route is wired in this slice.

Standalone R07/R08 comparison snapshots remain isolated and unchanged. Their own
node_modules installation has independent PM/Y constructors; routing their internals
across workspace package instances is unsafe. An attempted cross-wiring was caught,
reverted and its failed logs retained; isolated page10/entity14 regressions pass.
They are historical fixtures, not runtime dependencies or a second shipping editor.
Future I2 builds consume only the runtime entry graph. Do not point new code at them.

## Dependencies and formats

Runtime declares exact existing PM/Y/lib0 versions. Root lock reuses their existing
experiment version/integrity metadata and adds the transitive closure; existing lock
entries are unchanged except runtime declarations. Existing root esbuild0.28.1 is
now an explicit runtime dev dependency for boundary tests; native I1 comparison pack
retains its prior0.28.2 builder. No framework/editor/runtime version was upgraded.
Offline npm ci dry-run validates the lock plan; it is not a fresh online install.
Normal root npm ci --ignore-scripts prepares these declared workspace dependencies.

Current root envelope/bytes/schema validation and editor behavior are unchanged.
Browser codec consumes a checkout already hash-verified by CoreClient; backend
codec verifies identity/hash before decoding. No duplicate semantic save path.
The deliberately bounded paragraph schema is still a temporary supported subset:
full task pages, tables, media and product interactions remain required. This move
does not define the final shipping schema/codec or narrow any product contract.

## Verification and continuation

93/93 runtime tests pass, including four new cases: browser bundle graph and actual
execution without Buffer/process, single Yjs bundle instance; independently bundled
headless backend with note/task projection parity and corruption refusal; I1 shim
function identity; exact dependency/lock pins. Existing actual editor/SQLite/crash/
CLI/MCP/media/native-browser-pack tests all use the extracted implementation. Strict
TypeScript passes for typed runtime; extracted JS is covered by execution/source audit.
No Mac manual replay or profiling required. No native/performance/shipping pass inferred.

NEXT is I2c per START-HERE: selected Tauri composition using these shared entries,
with headless Core lifetime and peer CLI/MCP access, explicit platform ports, safe
view/context lifecycle and no production import from qualification documentation.
Native acceptance targets changed routes only once that composition is runnable.
