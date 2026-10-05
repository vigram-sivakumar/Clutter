# ADR-041: The Templates folder is the source of truth for template status — Sync reconciles the `kind: template` marker

**Status:** Accepted (design review, Vigram, 2026-10-05)

## Context

A note is a *template* when it lives in the reserved `Templates/` folder (or beneath it). The app shows that (the "Editing template" pill, no Move for a template) and, so the fact is also readable in the file itself, writes a frontmatter marker: `kind: template`.

Today the marker is only maintained by `PageOperations.move()` (`syncTemplateMarker`), so it is correct for in-app moves and wrong for anything else:

- A note moved **out** of `Templates/` in Finder keeps a stale `kind: template`.
- A note dropped **into** `Templates/` in Finder has no marker.
- Neither is repaired by opening the page, and the in-app path never runs for an external change.

This is the same shape of problem [ADR-026](./026-folder-archive-lifecycle.md)'s Sync amendment solved for Archive: lifecycle state lives in frontmatter, the folder is a storage convention, and an external move can leave the two disagreeing. That amendment is the pattern to follow.

**What `kind` is.** Investigated before writing it: `kind` is **not** an owned key (`OWNED_FRONTMATTER_KEYS`), nothing in Clutter reads it, and it is captured verbatim into `PageMetadata.unownedFrontmatter` like any user key — so a user may already have their own `kind: book`. (Lowercase `type` was the first choice but is a retired owned key the serializer drops on every save, so it cannot hold a marker.)

## Decision

1. **Invariant.** The reserved `Templates/` folder is the source of truth; the marker follows it:
   - a page inside `Templates/` (any depth) carries `kind: template`;
   - a page outside `Templates/` does not retain `kind: template`.

2. **One rule, one implementation.** `evaluateTemplateMarker(lines, inTemplates)` (`vault/ingest/frontmatter/templateMarker.ts`) is a pure function over the page's raw unowned frontmatter lines, returning the corrected lines or `null` for "already right". Both `PageOperations.syncTemplateMarker` (in-app move, behavior unchanged) and Sync call it — the rule is not written twice.

3. **Never overwrite unrelated metadata.** The rule only ever touches a `kind` line, and only as follows:
   - *inside Templates*: no `kind` → append `kind: template`; an existing scalar `kind` (any other value) → replaced with `template` (the product decision: update it if it already exists); already `kind: template` → no change;
   - *outside Templates*: only a `kind` whose value is exactly `template` is removed; any other `kind` is the user's own and is left alone;
   - a `kind` that is a **list**, or a differently-cased key (`Kind`) that would collide with it, is left untouched and **not marked** — a page is never failed or mangled to satisfy the marker. Every other frontmatter line stays byte-identical.
   - Archived pages are skipped (their frontmatter is not edited; restore returns a page to its original path with its marker intact).

4. **Sync reconciles after a rebuild, like archive metadata.** `reconcilePageTemplateMarker` (`vault/sync/reconcileTemplateMetadata.ts`) evaluates the rule from the page's **path** (not `parentId`, which may be unresolved mid-move), and, when it yields a change, persists through the same Sync-owned `persistSyncedPageDocument` pipeline archive repair uses. `VaultSyncService` runs it:
   - for a **moved** page, on the candidate page (final path) in the same step as the archive check, so a repair lands as one Vault commit — never a "moved" mutation followed by a "corrected" one;
   - after a **rebuild** of a changed existing page and after a **newly added** page (`reconcileFileEntity`), beside `reconcileArchiveMetadataForPage`;
   - at **startup**, for every page (`reconcileVaultTemplateMetadata`, beside `reconcileVaultArchiveMetadata`), to cover moves made while the app was closed.

5. **Nothing relies on opening a page or on `PageOperations.move()`** to repair the marker. Self-writes are already suppressed, so an in-app move is not re-reconciled; if it ever were, the rule is idempotent.

## Alternatives Considered

- **Leave external moves unrepaired.** Rejected: the file would keep claiming a status the folder contradicts, indefinitely, with no way to notice.
- **Repair on page open.** Rejected: it needs the page to be opened, writes from a read path, and a never-opened note would stay wrong.
- **Derive template status only from the folder and drop the marker.** Cleaner in principle, but the marker is a requested, user-visible property in the file; this ADR keeps it and makes it follow the folder.
- **Reuse `type: template`.** Rejected: `type` is a retired owned key dropped on every save.
- **A second copy of the rule in Sync.** Rejected by `ARCHITECTURE_RULES.md` rule 5 — one implementation, shared.

## Consequences

- `docs/architecture-specification.md` §Sync: the "Sync never initiates a write" invariant's exception now names template-marker repair beside archive-metadata repair; the internal-collaborator list and the move sequence mention it.
- Sync gains a second, narrow, frontmatter-only write (same pipeline, same justification as archive repair). It never changes a note's body.
- A user's own scalar `kind` is replaced when the page enters `Templates/` and is not restored when it leaves (only `kind: template` is removed). That is the accepted cost of "update it if it exists".
- Moving a whole **folder** into or out of `Templates/` is not repaired live (there is no folder-level rule and the subtree scan does not run the page rule); the startup pass repairs its pages on the next launch.
