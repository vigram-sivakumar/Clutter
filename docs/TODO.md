## Arc v2 — Vault (Complete)

- [x] Reorganize the Vault pipeline into Discover → Understand → Build → Knowledge.
- [x] Separate parser models from runtime models.
- [x] Introduce occurrence models for tasks, tags, links, and embeds.
- [x] Reorganize the `core/vault` folder structure.
- [x] Add barrel (`index.ts`) exports for each phase.
- [ ] Split `Page.ts` into `Page.ts`, `PageMetadata.ts`, `PageSource.ts`, and `PageAnalysis.ts`.
- [ ] Freeze the Arc v2 runtime model after the Page split.

---

## Arc v3 — Document Engine

### Phase 1 — Foundation

- [ ] Create `DocumentRegistry`.
- [ ] Create `DocumentSession`.
- [ ] Create `DocumentTransaction`.
- [ ] Create `DocumentRevision`.
- [ ] Create `DocumentState`.
- [ ] Create `SaveCoordinator`.

### Phase 2 — Open Document

- [ ] Open a page through `DocumentRegistry`.
- [ ] Create or attach to an existing `DocumentSession`.
- [ ] Attach multiple views to the same session.
- [ ] Detach views from a session.
- [ ] Dispose inactive sessions.

### Phase 3 — Editing

- [ ] Route all document edits through `DocumentSession`.
- [ ] Implement text transactions.
- [ ] Implement title editing.
- [ ] Implement frontmatter editing.
- [ ] Implement task toggle transactions.
- [ ] Track `currentRevision` and `savedRevision`.
- [ ] Implement dirty state.

### Phase 4 — PageFacts

- [ ] Generate `PageFacts` from committed revisions.
- [ ] Extract tasks.
- [ ] Extract tags.
- [ ] Extract links.
- [ ] Extract headings.
- [ ] Extract properties.
- [ ] Notify engine observers.

### Phase 5 — Persistence

- [ ] Implement `SaveCoordinator`.
- [ ] Implement persistence queue.
- [ ] Atomic Markdown writer.
- [ ] Autosave.
- [ ] Recovery preparation.
- [ ] Vault reconciliation.

### Phase 6 — Application Commands

- [ ] Create page.
- [ ] Rename page.
- [ ] Move page.
- [ ] Duplicate page.
- [ ] Archive page.
- [ ] Unarchive page.
- [ ] Delete page.
- [ ] Restore page.

### Phase 7 — File Reconciliation

- [ ] File system watcher.
- [ ] Detect external edits.
- [ ] Detect renames.
- [ ] Detect moves.
- [ ] Reconcile active document sessions.

---

## Arc v4 — Workspace & Navigation

- [ ] Workspace state.
- [ ] Open tabs.
- [ ] Navigation history.
- [ ] Breadcrumbs.
- [ ] Reveal in sidebar.
- [ ] Recently opened pages.
- [ ] Expanded folders.
- [ ] Split views.

---

## Arc v5 — Knowledge Engine

- [ ] Finalize link and embed projections.
- [ ] Backlinks.
- [ ] Incoming and outgoing links.
- [ ] Broken link diagnostics.
- [ ] Hover previews.

---

## Arc v6 — Search

- [ ] Full-text search.
- [ ] Filename search.
- [ ] Tag search.
- [ ] Search ranking.
- [ ] Result highlighting.

---

## Arc v7 — Graph

- [ ] Graph view.
- [ ] Local graph.
- [ ] Relationship explorer.
- [ ] Knowledge clusters.
