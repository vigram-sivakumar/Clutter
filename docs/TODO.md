# TODO

## Core Architecture

- [x] Reorganize the Vault pipeline into Discover → Understand → Build → Knowledge.
- [x] Separate parser models from runtime models.
- [x] Introduce occurrence models for tasks, tags, links, and embeds.
- [x] Reorganize the Core/Vault folder structure.
- [x] Add barrel (`index.ts`) exports for each phase.
- [ ] Split `Page.ts` into `Page.ts`, `PageMetadata.ts`, `PageSource.ts`, and `PageAnalysis.ts`.
- [ ] Rewrite `Architecture.md` to reflect the finalized architecture.

## Vault

- [ ] Create a new note.
- [ ] Rename a note.
- [ ] Move a note.
- [ ] Delete and restore a note.
- [ ] Create, rename, move, and delete folders.
- [ ] Implement file system watching.
- [ ] Incremental vault refresh.

## Knowledge

- [ ] Finalize Link and Embed projection models.
- [ ] Build backlinks.
- [ ] Build incoming/outgoing link navigation.
- [ ] Add diagnostics for broken links.

## Editor

- [ ] Load and save Markdown.
- [ ] Autosave.
- [ ] Inline title editing.
- [ ] Live metadata updates.

## UI

- [ ] Connect the sidebar to the runtime Vault.
- [ ] Connect the page view to runtime Pages.
- [ ] Render tasks from `TaskOccurrence`.
