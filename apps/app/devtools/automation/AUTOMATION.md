# Automation — Proof of Concept

**Status: proof of concept only.** This confirms the underlying tooling
(WebdriverIO + the real Tauri binary) works reliably on this machine.
It intentionally does not yet include the Surface Object layer, the
`AutomationDriver` abstraction, or workspace builders — those land in a
follow-up once this foundation is confirmed. Do not build more automation
tests against this file directly; wait for the migrated structure.

## What this is

Drives the **real, compiled Tauri application** — the actual binary, real
filesystem, real Tauri IPC — via WebdriverIO's `@wdio/tauri-service`, using
its `embedded` driver provider (the only one that supports macOS without a
paid CrabNebula subscription).

This deliberately replaces an earlier, abandoned approach that tried to run
the frontend in a plain browser against `npm run dev` with a fake in-memory
filesystem swapped into `Application.bootstrap()`. That would have meant
testing a parallel, fictional execution path instead of what users actually
run — rejected for that reason. Nothing in `src/` core/application code
branches on being under test.

## How the automation-only WebDriver surface is gated

Three independent layers, all required simultaneously — removing any one
disables it:

1. **Cargo feature (`automation`)** — `tauri-plugin-wdio-webdriver` is
   `optional = true` in `src-tauri/Cargo.toml`, pulled in only by the
   `automation` feature. Nothing in the ordinary build path
   (`npm run desktop`, `tauri build`, `tauri dev`) passes
   `--features automation`, so the crate is absent from their dependency
   graph entirely — not just unused, not linked at all. Verify with
   `cargo tree` vs. `cargo tree --features automation` in `src-tauri/`.

   Do **not** gate this with `cfg(debug_assertions)` in a
   `[target.'cfg(...)'.dependencies]` table — that was tried first and is
   wrong: `debug_assertions` isn't a Cargo target-cfg predicate (those only
   cover platform/arch), so it silently gated nothing and the crate ended up
   in release builds too. A real `cargo build --release` is the only way
   this was caught; `cargo tree --release` alone gave a false negative.
   Confirm any future change here with an actual `cargo build --release`,
   not just `cargo tree`.

2. **Rust runtime gate (`TAURI_AUTOMATION` env var)** — even compiled in
   (`--features automation`), `src-tauri/src/lib.rs` only calls
   `tauri_plugin_wdio_webdriver::init()` if `TAURI_AUTOMATION` is set. A
   developer who builds with the feature enabled by hand and runs the app
   normally still gets no WebDriver server.

3. **Tauri capability opt-in (`capabilities/automation.json`)** — the
   `wdio-webdriver:default` permission lives in its own capability file, not
   in `capabilities/default.json`. `tauri.conf.json`'s
   `app.security.capabilities` explicitly lists only `["default"]`, which
   disables Tauri's directory-auto-discovery — so `automation.json` is never
   applied unless a build explicitly merges `"automation"` into that array
   (which `wdio.conf.ts` does not currently need to do, since the embedded
   plugin's own command surface doesn't require frontend-side IPC
   permission for the PoC's needs — kept in place for when
   `browser.tauri.execute()` / command mocking are added).

## Running the PoC locally

```bash
# 1. Build the automation-enabled debug binary
cd apps/app/src-tauri
cargo build --features automation

# 2. Run the WebdriverIO spec against it
cd ..
npx wdio run devtools/automation/wdio.conf.ts
```

This launches the real app (against whatever vault path is currently
hardcoded in `AppShell.tsx` — no vault seeding/reset exists yet), confirms
the sidebar renders (`[data-testid="sidebar"]`, wired in
`src/app/layouts/sidebar/Sidebar.tsx`), saves a screenshot to
`devtools/automation/screenshots/poc.png`, and exits — verified to leave no
orphaned process.

## What's deliberately not here yet

- Surface Objects (`SidebarSurface`, `EditorSurface`, etc.)
- The `AutomationDriver` abstraction (WebdriverIO calls are inline in
  `poc.spec.ts` today — that's temporary)
- Workspace builders (`empty()`, `nested()`, `large()`,
  `obsidianImport()`) — vault seeding/reset
- Log forwarding, command mocking (`tauri-plugin-wdio`, the sibling plugin
  to `tauri-plugin-wdio-webdriver`, not yet added)
- CI wiring
- Migration of the old Playwright-based `e2e/` suite (still present,
  unmodified, and not runnable — kept only until the migration happens, at
  which point it should be deleted rather than left alongside the new
  suite)

See `TESTING.md` for day-to-day testing guidance (currently: how to run
this PoC and the existing Vitest unit suite; will expand as the above
lands).
