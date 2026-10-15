# ADR-056: Spaces are application-level; switching a Space closes the Application and bootstraps a new one

**Status:** Accepted (approved for implementation, 2026-10-15). Adds no subsystem, write path or Gate operation. `Application` stays one-per-vault-root; the Space registry lives above it, in the UI shell where the Composition Root is already created and closed (ADR-014).

## Context

Until now the vault root was one hard-coded path in `AppShell` (marked TODO "replace with the folder picker"). Product wants several Spaces — a Space is an existing folder on disk, named after that folder — with "New space" opening the native directory picker, and the active Space restored on restart.

Investigation found the lifecycle already supports this:

- `Application.bootstrap(rootPath)` builds the whole runtime graph for one root, and `Application.close()` is its orderly, idempotent teardown (flush every dirty page and folder, flush the workspace session, stop the filesystem watcher, dispose sync, cancel timers, dispose projections, clear sessions). Its own doc comment names "an eventual vault-switch flow" as an intended caller.
- `AppShell` already creates and closes an `Application` in an effect keyed on `vaultPath`.
- The Rust watcher is token-owned (`should_stop`), so a belated `stop` from the old watcher cannot tear down the new one.
- Every per-root store (`.clutter/workspace.json` keys, parsed-note cache keyed by root) is loaded inside `bootstrap`, so nothing from a previous Space survives in the new `Application`.

No ADR defines multiple Spaces or a registry. Nothing app-level (outside a vault's `.clutter`) is persisted today except the parsed-note cache.

## Decision

1. **The registry is application-level and lives outside every Space**: `{ paths, activePath }` under one key (`clutter.spaces.v1`) in the webview's `localStorage`, read tolerantly (anything malformed yields the default registry) and written best-effort. It is deliberately not in a Space's `.clutter` (a Space cannot know about its siblings, and an unreadable Space would hide the list that leads out of it).
2. **A Space is identified by its normalized path**; its display name is the folder's name. Registering a folder already in the registry only activates it. No separate display-name field.
3. **Switching = prepare, then commit.** Changing `activePath` makes `AppShell` `bootstrap()` the next `Application` (filesystem, scan, stores, services) *while the current one stays mounted and usable*; `bootstrap()` starts no watcher and shows nothing. Only once it is built does a short commit run, serialized with any other: close the current `Application` (its orderly `close()`), `open()` the new one, and swap the UI in one render. The watcher is a single native slot with one global event name, which is why the old Application must close before the new one opens. At most one `Application` is ever *open*; a prepared one that was superseded or cancelled is closed unused. The "Opening Clutter…" frame is the first-open path only. `AppLayout` is keyed by the vault root so state it reads once at mount is rebuilt per Space.
4. **Safe failure.** A folder is probed read-only (`probeSpaceFolder`: exists, is a directory, readable, inside the filesystem scope) before any switch; `bootstrap` would otherwise create a missing root. If preparation fails, nothing changes but the registry, which returns to the last Space that opened; if the new one fails during `open()` after the old one closed, the old one is rebuilt and reopened. The registry is persisted only after a Space has opened, so a bad folder is never what the next launch tries first. At startup an unavailable active Space falls back to the first registered one that opens.
5. **No import step.** Existing Markdown, PDFs, images and subfolders are indexed by the normal scan. Opening a Space writes only what a normal open already writes (see Consequences).

## Alternatives considered

- *Registry in each Space's `.clutter`* — rejected (decision 1).
- *Native store via a Rust command or `plugin-store`* — more durable than `localStorage` (which a browser-data clear would wipe) but adds Rust/dependency surface for a small list. The registry is behind `loadSpaceRegistry`/`saveSpaceRegistry`, so this is a contained later swap.
- *Open two `Application`s at once for a seamless swap* — rejected: the Rust watcher is a singleton and both would hear its global events. Only *preparation* overlaps.
- *Reload the window on switch* — rejected: loses the orderly `close()` flush guarantee.

## Consequences

- During preparation the current Space stays fully usable. Between closing it and the swap (its final flush plus the new one's `open()`) the old screen is briefly inert; edits made in that window are not possible to flush.
- `bootstrap` can already write to a vault on open (duplicate-ID repair, archive/template reconciliation). A folder with existing notes may therefore receive those repairs on first open. This is existing behaviour, not new to Spaces.
- The filesystem scope is `$HOME/**`; folders outside the home directory are refused by the probe.
- The registry is per webview profile, not synced across devices.
- Not covered here: avatar customization/persistence, renaming or removing a Space, a Settings view.
