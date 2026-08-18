import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { PageOperations } from '@core/application/page/PageOperations';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import type { ResolveWikiLink, WikiLinkResolution } from '@features/markdown/editor/MarkdownEditor';

/**
 * Composes `Vault` + `PageOperations` into the editor's injected
 * `ResolveWikiLink` boundary — the editor itself never imports either
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 * This is presentation-layer glue in the same vein as `buildBreadcrumbs`/
 * `toResourcePageModel` (both already live under `app/layouts/page/` or
 * `core/presentation/`), not a new navigation layer: resolution reads
 * `Vault` directly via its own existing `getPageByPath` (the same method
 * `Application.openFallbackPage` already uses) plus a linear alias scan
 * over `vault.pages()`, and activation calls the existing
 * `PageOperations.open(pageId)` — no new subsystem, no new write path.
 */
export function createWikiLinkResolver(vault: Vault, pageOperations: PageOperations): ResolveWikiLink {
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
      // Clicking an unresolved reference creates the referenced page
      // through the existing PageOperations.create() flow (which already
      // opens what it creates — see PageOperations.create's own
      // implementation) rather than inventing a second creation or
      // navigation path. The WikiLink's own path, not the local alias, is
      // what's preserved: `title` is the path's last segment, `folderId`
      // resolves to an already-existing folder matching the path's
      // directory portion when there is one (never auto-created — that's
      // FolderOperations' capability, out of scope here), else root.
      activate: () => {
        const title = VaultPath.filename(path);
        const parentPath = VaultPath.parentDirectory(path);
        const folderId = parentPath
          ? (vault.getFolderByPath(`${vault.root}/${parentPath}`)?.id ?? null)
          : null;

        void pageOperations.create({ folderId, title });
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
