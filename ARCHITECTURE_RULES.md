# Clutter implementation boundaries

This replaces governance for the retired CM6/Markdown application. The user explicitly
authorized a clean rebuild, including old persistence, UI controllers, tests and docs.
Read [architecture](docs/architecture.md) and [current checkpoint](docs/foundation/START-HERE.md).

- One SpaceService owns page/task/media semantics and accepted revision decisions.
  UI, CLI and MCP are peer command clients; none owns another save implementation.
- Core depends only on portable contracts/ports. Node/SQLite/filesystem, React and
  native framework imports do not belong in Core.
- Editor owns PM/Y bindings, schema, history and codecs. React owns surrounding UI.
  They do not reconcile the same editable subtree or keep duplicate body state.
- View, editing context, page and window lifetimes differ. Navigation can detach/cache or evict a
  view resource; it does not discard the context or bypass protection of an inactive page.
- Desktop runtime owns storage/assets/transport/discovery mechanisms. Native Rust
  only composes OS/window mechanisms. There is no second native semantic Core.
- New product code imports neither research/docs nor retired implementations.
  No compatibility façades, parallel old/new writers or migration bridge.
- Use exact checked-in external dependency graphs. No generated bundles, caches,
  private sessions, credentials or real notes enter source control.
- Tests/native evidence apply only to their actual scope. Disposable development
  storage is not installed durability/security/scale/distribution qualification.

`npm run check:boundaries` checks source dependency directions and retired graph
absence. Behavioral tests validate actual Core, storage, views and peer clients.

- Routine UI operations are scoped to their request/destination. Do not introduce
  a normal window-wide busy/disabled/read-only cycle. Keep stable pane hosts and
  prepare actual editor surfaces before revealing layout/content. Preserve durable
  recovery registration, current intent/focus and all-operation close barriers.
