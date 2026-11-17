# Clutter Structured

Clean structured-document rebuild of Clutter. One shared React UI, ProseMirror/Yjs
editor, portable TypeScript Core, SQLite and immutable media, with a Tauri desktop
host. The CM6/Markdown product, compact Markdown renderer, old vault/persistence
pipeline and their compatibility controllers are removed from this branch.

Start with [development](docs/development.md), [architecture](docs/architecture.md)
and the [current checkpoint](docs/foundation/START-HERE.md).

```bash
npm ci --ignore-scripts
npm run desktop
```

The native runner currently targets macOS ARM64 with the existing Rust1.90.0/Xcode
pins. It prepares its own pinned Node runtime. No historical experiment cache is
required. `npm run desktop:reopen` reopens the same development Space. This is a
synthetic-content development entry, not a data-bearing release. Tests need
Node24.22.1; the native bootstrap itself supports developer Node24.11.

The development UI supports page creation/list/open, paragraph editing, current-tab
navigation with Back/Forward, explicit new-tab/in-tab split menus, retained sessions,
context-specific undo/redo, saved tab layouts and protected close across hidden views.
It is intentionally incomplete: full editor components, task/media/property UI,
complete navigation and installed persistence/security/distribution remain next.
There are no existing-user migration or legacy-compatibility requirements.
