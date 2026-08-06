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

Three independent layers, all required simultaneously, all living in
`apps/app/src-tauri` (the plugin has to be part of the binary being
compiled — this package can't inject it from outside) — removing any one
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

3. **Tauri capability opt-in (`capabilities/automation.json`)** — the
   `wdio-webdriver:default` permission lives in its own capability file in
   `apps/app/src-tauri/capabilities/`, not in `capabilities/default.json`.
   `tauri.conf.json`'s `app.security.capabilities` explicitly lists only
   `["default"]`, which disables Tauri's directory-auto-discovery — so
   `automation.json` is never applied unless a build explicitly merges
   `"automation"` into that array (not currently needed for the PoC's
   needs — kept in place for when `browser.tauri.execute()` / command
   mocking are added).

## The application's automation contract

Selectors this package uses to find elements live in the application
itself, not here: `apps/app/src/shared/testing/selectors.ts`. It's
imported directly (a workspace-relative import, see `scenarios/poc.spec.ts`)
rather than duplicated — one source of truth, and a deliberate one-way
dependency (this package depends on that file; `apps/app` never depends on
anything in this package).

## Running the PoC locally

From the repo root:

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
