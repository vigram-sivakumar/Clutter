import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import type { ResolveWikiLink, WikiLinkResolution } from '@features/markdown/editor/MarkdownEditor';

/**
 * Composes `Vault` + `PageOperations`/`FolderOperations` into the
 * editor's injected `ResolveWikiLink` boundary — the editor itself never
 * imports any of them (docs/editor-architecture-decisions.md,
 * "Editor/persistence boundary"). This is presentation-layer glue in the
 * same vein as `buildBreadcrumbs`/`toResourcePageModel` (both already
 * live under `app/layouts/page/` or `core/presentation/`), not a new
 * navigation or filesystem layer: resolution reads `Vault` directly via
 * its own existing `getPageByPath`/`getFolderByPath` (the same methods
 * `Application.openFallbackPage`/`DailyNoteService.ensureFolderChain`
 * already use) plus a linear alias scan over `vault.pages()`, and
 * activation calls the existing `PageOperations.open()`/`.create()` and
 * `FolderOperations.create()` — no new subsystem, no new write path.
 */
export function createWikiLinkResolver(
  vault: Vault,
  pageOperations: PageOperations,
  folderOperations: FolderOperations
): ResolveWikiLink {
  function resolvedTo(page: Page, localAlias: string | null): WikiLinkResolution {
    // Display-label precedence: local alias > target's primary frontmatter
    // alias (the first declared alias) > filename
    // (docs/editor-architecture-decisions.md, "WikiLink resolution,
    // aliases, and display").
    const primaryAlias = page.analysis.aliases[0]?.value;
    const displayLabel = localAlias ?? primaryAlias ?? VaultPath.pageName(page.path);

    return {
      status: 'resolved',
      displayLabel,
      activate: () => void pageOperations.open(page.id),
    };
  }

  return (path, localAlias) => {
    // WikiLink targets are canonically vault-relative, no extension
    // (docs/editor-architecture-decisions.md, "Path normalization");
    // Vault.getPageByPath keys on the root-prefixed filesystem path
    // (confirmed against Vault.getFolderByPath's identical
    // `${this.root}/${relativePath}` composition and
    // Application.openFallbackPage's own DailyNotePath.absoluteFrom(root, ...)
    // lookup), so the root and extension are added back here, at the
    // resolution boundary, never stored that way.
    const literal = vault.getPageByPath(`${vault.root}/${path}.md`);
    if (literal) {
      return resolvedTo(literal, localAlias);
    }

    // Alias-based resolution is tried only after a literal path match
    // fails, per the locked fallback ordering — never auto-rewritten to
    // the canonical path.
    const aliasMatches = findPagesByAlias(vault, path);
    if (aliasMatches.length === 1) {
      return resolvedTo(aliasMatches[0] as Page, localAlias);
    }

    if (aliasMatches.length > 1) {
      // Ambiguous alias matches must produce an explicit ambiguous state,
      // never a silent pick.
      return { status: 'ambiguous', displayLabel: localAlias ?? path, activate: () => {} };
    }

    return {
      status: 'unresolved',
      displayLabel: localAlias ?? path,
      // Clicking an unresolved reference creates the referenced page —
      // full path preserved, including any missing intermediate folders
      // — then opens it, through the existing PageOperations.create()/
      // FolderOperations.create() flows (create() already opens what it
      // creates — see PageOperations.create's own implementation) rather
      // than inventing a second creation or navigation path.
      activate: () => {
        void createReferencedPage(vault, folderOperations, pageOperations, path);
      },
    };
  };
}

function findPagesByAlias(vault: Vault, alias: string): Page[] {
  const matches: Page[] = [];
  for (const page of vault.pages()) {
    if (page.analysis.aliases.some((candidate) => candidate.value === alias)) {
      matches.push(page);
    }
  }
  return matches;
}

/**
 * Creates the page an unresolved WikiLink refers to, at its exact
 * referenced path, then opens it. The WikiLink's own path is what's
 * preserved, never the local alias: `title` is the path's last segment;
 * any missing intermediate folders are created in order via
 * `ensureFolderChain` below before the note itself is created inside the
 * resulting parent.
 *
 * Re-checks `Vault` immediately before each write (both here and inside
 * `ensureFolderChain`) rather than trusting the caller's already-stale
 * "this was unresolved" snapshot — the resolver closure only runs at
 * render time, `activate()` runs at click time, and the two can be
 * arbitrarily far apart (or, for a repeated activation of the very same
 * reference, run twice against the one `Vault`), so the target may have
 * already been created by the time this actually runs. `Vault` is
 * already the single source of truth this whole feature is built on
 * (docs/editor-architecture-decisions.md's "one-way pipeline" — nothing
 * here duplicates that state in a second, parallel bookkeeping
 * structure), and `PageOperations.create()`/`FolderOperations.create()`
 * are both known not to be idempotent themselves (they always create
 * something, appending a collision suffix if the name is taken — see
 * `FolderOperations.create`'s own doc comment), so skipping this check
 * would create a duplicate on every repeated activation.
 */
async function createReferencedPage(
  vault: Vault,
  folderOperations: FolderOperations,
  pageOperations: PageOperations,
  path: string
): Promise<void> {
  const targetPath = `${vault.root}/${path}.md`;

  const existing = vault.getPageByPath(targetPath);
  if (existing) {
    void pageOperations.open(existing.id);
    return;
  }

  const title = VaultPath.filename(path);
  const parentDirectory = VaultPath.parentDirectory(path);
  const folderId = parentDirectory
    ? await ensureFolderChain(vault, folderOperations, parentDirectory)
    : null;

  // The folder chain above may itself have taken a while (one Gate
  // round-trip per missing level) — re-check once more immediately
  // before creating the note itself, for the same reason as the check
  // above.
  const createdMeanwhile = vault.getPageByPath(targetPath);
  if (createdMeanwhile) {
    void pageOperations.open(createdMeanwhile.id);
    return;
  }

  void pageOperations.create({ folderId, title });
}

/**
 * Ensures every level of `relativeDirectory` (vault-relative,
 * `/`-separated) exists as a `Folder`, creating only whichever levels are
 * missing, in order — the same check-then-create-per-level shape
 * `DailyNoteService.ensureFolderChain` already uses (`FolderOperations.create()`
 * is not idempotent, so an already-existing level must never be blindly
 * re-created), generalized here to start at the vault root rather than a
 * reserved folder and to walk an arbitrary number of segments rather
 * than a fixed year/month pair. Returns the innermost folder's id, for
 * the caller to use as the new note's `folderId`.
 */
async function ensureFolderChain(
  vault: Vault,
  folderOperations: FolderOperations,
  relativeDirectory: string
): Promise<string> {
  let parentId: string | null = null;
  let parentPath = vault.root;

  for (const segment of relativeDirectory.split('/')) {
    const folderPath = `${parentPath}/${segment}`;
    const existing = vault.getFolderByPath(folderPath);

    if (existing) {
      parentId = existing.id;
      parentPath = existing.path;
      continue;
    }

    const createdId = await folderOperations.create(segment, parentId);
    const created = vault.getFolder(createdId);

    if (!created) {
      // FolderOperations.create() always calls Vault.addFolder
      // synchronously before resolving (mirrors DailyNoteService.
      // ensureFolderChain's own identical defensive check), so this
      // should be unreachable.
      throw new Error(`Folder not found immediately after creation: ${createdId}`);
    }

    parentId = created.id;
    parentPath = created.path;
  }

  // relativeDirectory is only ever passed in non-empty (the caller
  // guards on `parentDirectory` truthiness), so the loop above always
  // runs at least once and parentId is always a real id by this point —
  // the `string | null` annotation above exists only because TypeScript
  // can't prove that from the loop shape itself.
  return parentId as string;
}
