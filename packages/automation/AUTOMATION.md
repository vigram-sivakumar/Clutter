# @clutter/automation — Proof of Concept

**Status: proof of concept only.** This confirms the underlying tooling
(WebdriverIO + the real Tauri binary) works reliably on this machine.
It intentionally does not yet include the Surface Object layer, the
`AutomationDriver` abstraction, or workspace builders — those land in a
follow-up once this foundation is confirmed. Do not build more automation
tests against this file directly; wait for the migrated structure.

## What this is

This package is a **separate workspace, external to `apps/app`** — it
drives the real, compiled Tauri application (the actual binary, real
filesystem, real Tauri IPC) over the WebDriver protocol via
`@wdio/tauri-service`, using its `embedded` driver provider (the only one
that supports macOS without a paid CrabNebula subscription).

`apps/app` has zero automation dependencies (no `@wdio/*`, no
`@playwright/test`) — this package is the thing that knows how to build
the app in automation mode and drive it, not the other way around.

This deliberately replaces an earlier, abandoned approach that tried to run
the frontend in a plain browser against `npm run dev` with a fake in-memory
filesystem swapped into `Application.bootstrap()`. That would have meant
testing a parallel, fictional execution path instead of what users actually
run — rejected for that reason. Nothing in `apps/app/src` branches on being
under test. A second, earlier approach (Playwright driving a plain browser)
was also rejected and removed for the same underlying reason: it can't
exercise the real native webview at all.

## How the automation-only WebDriver surface is gated

Two independent layers, both required simultaneously, both living in
`apps/app/src-tauri` (the plugin has to be part of the binary being
compiled — this package can't inject it from outside) — removing either
disables it:

1. **Cargo feature (`automation`)** — `tauri-plugin-wdio-webdriver` is
   `optional = true` in `apps/app/src-tauri/Cargo.toml`, pulled in only by
   the `automation` feature. Nothing in the ordinary build path
   (`npm run desktop`, `tauri build`, `tauri dev`) passes
   `--features automation`, so the crate is absent from their dependency
   graph entirely — not just unused, not linked at all. Verify with
   `cargo tree` vs. `cargo tree --features automation` in `apps/app/src-tauri/`.

   Do **not** gate this with `cfg(debug_assertions)` in a
   `[target.'cfg(...)'.dependencies]` table — that was tried first and is
   wrong: `debug_assertions` isn't a Cargo target-cfg predicate (those only
   cover platform/arch), so it silently gated nothing and the crate ended up
   in release builds too. A real `cargo build --release` is the only way
   this was caught; `cargo tree --release` alone gave a false negative.
   Confirm any future change here with an actual `cargo build --release`,
   not just `cargo tree`.

2. **Rust runtime gate (`TAURI_AUTOMATION` env var)** — even compiled in
   (`--features automation`), `apps/app/src-tauri/src/lib.rs` only calls
   `tauri_plugin_wdio_webdriver::init()` if `TAURI_AUTOMATION` is set. A
   developer who builds with the feature enabled by hand and runs the app
   normally still gets no WebDriver server.

A third layer — an explicit Tauri capability file
(`capabilities/automation.json`) granting `wdio-webdriver:default`, kept
out of `capabilities/default.json` — was tried and removed. It broke every
ordinary build, automation or not: Tauri's build-time permission validator
checks every file under `capabilities/` against the currently-linked
plugins' permissions regardless of whether that capability is in
`tauri.conf.json`'s active `security.capabilities` list, so a plain
`cargo build` (no `automation` feature, hence no
`tauri-plugin-wdio-webdriver` linked) failed to build at all — `Permission
wdio-webdriver:default not found`. Confirmed by removing the file: default
`cargo build` and `cargo build --features automation` both succeed cleanly
without it. It was also never actually consumed — the embedded WebDriver
server is a raw HTTP server the plugin binds directly, not something
reached through Tauri's IPC/command-permission system, so nothing needed
that permission grant in the first place. Re-add a capability file only
once something genuinely needs a Tauri-IPC-gated command (e.g.
`tauri-plugin-wdio`'s `browser.tauri.execute()`/mocking surface), and at
that point solve the "don't break ordinary builds" problem explicitly
(e.g. the automation build step generates the file transiently, rather
than committing a permission the ordinary build can't resolve).

## The application's automation contract

Selectors this package uses to find elements live in the application
itself, not here: `apps/app/src/shared/testing/selectors.ts`. It's
imported directly (a workspace-relative import, see `scenarios/poc.spec.ts`)
rather than duplicated — one source of truth, and a deliberate one-way
dependency (this package depends on that file; `apps/app` never depends on
anything in this package).

## Performance

**`bootstrap/session.ts` handles this automatically — no spec file needs
to know it exists.** It's a WDIO *service* (not a spec-level helper),
registered in `wdio.conf.ts`'s `services` array after `@wdio/tauri-service`.
Services run their `before()` hooks in registration order, so by the time
ours fires, `@wdio/tauri-service`'s own `before()` has already attached
`browser.tauri` — verified empirically (`typeof browser.tauri` logs
`'object'` at that point), not assumed.

Without it, every `findElement`/`findElements`/`$`/`$$`/`elementClick`/
`getTitle` command pays a blocking ~10-20s tax. This isn't an inherent
limit of the embedded provider, macOS, or our selector strategy — it's a
specific, fixable gap: `@wdio/tauri-service`'s `ensureActiveWindowFocus`
check runs before those six command types and calls
`browser.tauri.execute()` to read window focus state; that call needs
`window.__wdio_original_core__`, which is injected by the frontend
companion package `@wdio/tauri-plugin` — which this app has never
installed. So the call always fails after its own internal 5000ms
timeout (observed 2-3x per interaction, since a chained `$(sel).click()`
triggers the check separately for the element lookup and the click), then
gives up and the real command runs fine anyway over the raw WebDriver
protocol, which was never the slow part.

`bootstrap/session.ts` calls `browser.tauri.switchWindow('main')` once
per session (not a real switch — we have one window). This makes
`@wdio/tauri-service` treat focus as already explicitly handled and skip
the check for the rest of that session (`userSwitchedWindowCache`, keyed
by session id). That call itself still pays the same ~5s tax once (it
needs the same missing bridge to validate the window label) — an
unavoidable one-time cost with the current setup, not a per-command one.

Two other approaches were tried and rejected before this one:
- A `before` function directly on the `wdio.conf.ts` config object — fires
  *before* `browser.tauri` is attached (confirmed:
  `TypeError: Cannot read properties of undefined (reading 'switchWindow')`),
  so it can't call this at all.
- A mocha root-hooks file loaded via `mochaOpts.require` — silently never
  ran. `mochaOpts.require` goes through mocha's own file loader, not
  WDIO's TypeScript-aware spec loader that `.spec.ts` files get, so a
  `.ts` file registered that way never actually loads with this project's
  setup. No error, no log line — just never executed. Caught only by
  checking for the expected `switchWindow` log output and not finding it.

**Measured** (`packages/automation/scenarios`, single MacBook, embedded
provider, three consecutive runs per configuration):

| Stage | Without the fix | With the fix |
|---|---|---|
| App process spawn → embedded server ready | ~1.5s (fixed, paid once per `wdio run`, not per spec file) | same |
| Embedded server ready → WebDriver session established | ~1.3s | same |
| One-time per-session `switchWindow` suppression call | n/a (not called) | ~5.0s (once per spec file) |
| `findElement` | ~10-20s | ~3-6ms |
| `findElements` | ~10-20s | ~3-6ms |
| `elementClick` | ~10-20s | ~5-10ms |
| `getAttribute`/`getText` (not focus-gated, always fast) | ~2-3ms | ~2-3ms |
| `deleteSession` (shutdown) | ~10-15ms | same |
| Process teardown after last spec | ~250ms | same |
| **`poc.spec.ts` (1 command)** | ~30-35s | **~5.1s** |
| **`draft-discard.spec.ts` (~9 commands, was written pre-fix with a manual 15s `browser.pause` to work around the false negative this caused)** | 2min+ (routinely hit mocha's 60-120s timeout before completing) | **~5.3s** |

Root cause confirmed empirically, not assumed: raw command round-trips
(POST/GET straight to the embedded server, visible in `webdriver` debug
logs) were consistently 2-15ms even *before* the fix — the 10-20s was
entirely the focus-check's own dead time in front of each command, never
the command itself.

**`@wdio/tauri-plugin` (the frontend companion package): investigated, not
adopted.** Confirmed via WebdriverIO's own docs: it's the *officially
intended* way to get full `@wdio/tauri-service` functionality —
`browser.tauri.execute()`, command mocking, log forwarding — and would
also make `ensureActiveWindowFocus` succeed immediately instead of
timing out (it internally depends on `execute()`), eliminating even the
one-time ~5s/session cost. But basic automation (find/click/screenshot —
everything we actually use) is explicitly documented as working *without*
it; it's additive, not a prerequisite.

Trade-off: installing it means a real, new dependency in `apps/app`'s own
`package.json` plus a frontend import (`import '@wdio/tauri-plugin'` in
`main.tsx` or `index.html`) — and there is **no officially documented way
to gate that import to dev-only**. We'd have to invent and maintain our
own guard (e.g. a dynamic `import()` behind `import.meta.env.DEV`,
mirroring `devtools/index.ts`'s pattern) and then independently verify it
tree-shakes out of `vite build` output, the same way we verified
`devtools/`'s code does — nontrivial ongoing verification burden for a
capability (`execute()`/mocking) we don't currently use.

**Recommendation: keep the `switchWindow()` bootstrap.** It keeps
`apps/app` at zero automation dependencies — the single goal this whole
restructuring optimized for — and already captures effectively the whole
win (10-20s → single-digit ms per command; the remaining cost is a flat
~5s *per spec file*, not per command, so it doesn't compound as the
number of commands in the suite grows, only as the number of spec files
does). The one real risk: `browser.tauri.switchWindow()` itself is a
public, documented API, but the specific side effect we depend on —
permanently suppressing the focus check for the rest of the session via
`userSwitchedWindowCache` — is an implementation detail of
`@wdio/tauri-service`, not a documented contract. A future major version
could change it. Worth re-verifying this benchmark after any
`@wdio/tauri-service` upgrade. Revisit installing the plugin only if we
end up genuinely needing `browser.tauri.execute()` or command mocking —
not preemptively.

**Test design**: prefer one WebDriver command over several whenever
possible (e.g. a single `waitUntil` polling loop over repeated manual
`browser.pause()` + check). Polling itself is now cheap (`waitUntil`'s
default 500ms interval costs ~5-10ms of actual work per poll, not
500ms+per-check like it would have pre-fix) — favor short `waitUntil`
timeouts (we use 5000ms) over long fixed sleeps. A regression suite should
not need to navigate through incidental UI to reach the state under test;
none of our scenarios do this yet only because there's no workspace-builder/
vault-seeding layer yet (tracked below) — once one exists, prefer seeding
state directly over clicking through the UI to build it.

## Running the PoC locally

**Prerequisite: the app's Vite dev server must already be running.** The
debug binary this builds loads its frontend from `tauri.conf.json`'s
`devUrl` (`http://localhost:5173`), not from bundled assets — that's true
of any debug build, automation or not. Start it first, in a separate
terminal, and leave it running:

```bash
npm run dev   # from the repo root, or `cd apps/app && npm run dev`
```

Then, from the repo root:

```bash
npm run automation:build   # cargo build --features automation
npm run automation:poc     # wdio run wdio.conf.ts
```

Or from this package directly:

```bash
cd packages/automation
npm run build:app
npm run poc
```

This launches the real app (against whatever vault path is currently
hardcoded in `apps/app/src/app/AppShell.tsx` — no vault seeding/reset
exists yet), confirms the sidebar renders
(`[data-testid="sidebar"]`, wired in
`apps/app/src/app/layouts/sidebar/Sidebar.tsx`), saves a screenshot to
`screenshots/poc.png`, and exits — verified to leave no orphaned process.

## What's deliberately not here yet

- Surface Objects (`SidebarSurface`, `EditorSurface`, etc.)
- The `AutomationDriver` abstraction (WebdriverIO calls are inline in
  `scenarios/poc.spec.ts` today — that's temporary)
- Workspace builders (`empty()`, `nested()`, `large()`,
  `obsidianImport()`) — vault seeding/reset
- Log forwarding, command mocking (`tauri-plugin-wdio`, the sibling plugin
  to `tauri-plugin-wdio-webdriver`, not yet added)
- CI wiring
- A dedicated `TESTING.md` for this package (conventions, adding new
  scenarios) — written once the Surface Object structure above exists;
  writing it now would document things that don't exist yet.

The old Playwright-based `apps/app/e2e/` suite has been deleted — this is
now the one automation system.
