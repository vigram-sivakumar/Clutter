import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import type {
  GetWikiLinkSuggestions,
  WikiLinkPageSuggestion,
  WikiLinkSuggestion,
} from '@features/markdown/editor/MarkdownEditor';

import { createReferencedPage } from './resolveWikiLink';

/**
 * Composes `Vault` + `PageOperations`/`FolderOperations` into the editor's
 * injected `GetWikiLinkSuggestions` boundary — the autocomplete counterpart
 * to `createWikiLinkResolver` above, same file-placement reasoning: this is
 * presentation-layer glue, the editor itself never imports `Vault` or
 * either facade (docs/editor-architecture-decisions.md, "Editor/persistence
 * boundary").
 *
 * Matching is deliberately the simplest thing that already has a precedent
 * in this codebase: plain case-insensitive substring match against a
 * page's title and its `analysis.aliases` — the exact algorithm
 * `FolderPicker.tsx` already uses for folder names
 * (`item.title.toLowerCase().includes(normalizedQuery)`), extended only to
 * also check aliases, since WikiLinks (unlike folder names) already
 * resolve through them (`resolveWikiLink.ts`'s `findPagesByAlias`). No
 * fuzzy matching, no ranking beyond a fixed deterministic order — this
 * codebase has no existing search/fuzzy-match implementation to build on
 * (confirmed: `features/search/SearchPanel.tsx` is an unimplemented stub),
 * so inventing one here would be new, unreviewed matching infrastructure
 * for a single caller.
 */
export function createWikiLinkSuggester(
  vault: Vault,
  pageOperations: PageOperations,
  folderOperations: FolderOperations
): GetWikiLinkSuggestions {
  return (query) => {
    const normalizedQuery = query.trim().toLowerCase();

    // Deterministic, simple order: natural/alphanumeric by title, the
    // same comparator convention VaultQuery.ts's compareByName already
    // establishes for every other listing in this codebase — not a
    // relevance ranking, just a stable, predictable order.
    const byTitle = (a: WikiLinkPageSuggestion, b: WikiLinkPageSuggestion) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

    // Empty query: a freshly typed `[[` (closeBrackets already produces
    // the closed, empty `[[]]` node before any character is typed) — show
    // every page rather than nothing, so autocomplete opens immediately
    // instead of waiting for the first typed character
    // (docs/editor-architecture-decisions.md's WikiLink autocomplete
    // investigation). No Create option here: an empty path has nothing to
    // create yet.
    if (!normalizedQuery) {
      return Array.from(vault.pages()).map((page) => toPageSuggestion(vault, page)).sort(byTitle);
    }

    const matches = Array.from(vault.pages())
      .filter((page) => matchesQuery(page, normalizedQuery))
      .map((page) => toPageSuggestion(vault, page))
      .sort(byTitle);

    if (matches.length > 0) {
      return matches;
    }

    // Mirrors FolderPicker's own rule exactly (FolderPicker.tsx's
    // `showCreate`): a Create option is offered only when the search
    // produces zero matches, never alongside real results.
    const path = query.trim();
    const suggestion: WikiLinkSuggestion = {
      kind: 'create',
      path,
      create: () => {
        // Autocomplete acceptance is insertion-only — never navigates to
        // the newly created page (docs/editor-architecture-decisions.md's
        // "autocomplete acceptance is insertion-only" invariant).
        void createReferencedPage(vault, folderOperations, pageOperations, path, false);
      },
    };

    return [suggestion];
  };
}

function matchesQuery(page: Page, normalizedQuery: string): boolean {
  const title = VaultPath.pageName(page.path).toLowerCase();
  if (title.includes(normalizedQuery)) {
    return true;
  }

  return page.analysis.aliases.some((alias) => alias.value.toLowerCase().includes(normalizedQuery));
}

/**
 * `page.path` is root-prefixed with a `.md` extension (Vault's own storage
 * shape); WikiLink targets are vault-relative with no extension
 * (docs/editor-architecture-decisions.md, "Path normalization") — the
 * inverse of the composition `resolveWikiLink.ts`'s resolver already does
 * at its own resolution boundary (`${vault.root}/${path}.md`), same
 * "never stored that way, only computed at the boundary" reasoning
 * applied in the opposite direction.
 */
function toPageSuggestion(vault: Vault, page: Page): WikiLinkPageSuggestion {
  const withoutRoot = page.path.startsWith(`${vault.root}/`)
    ? page.path.slice(vault.root.length + 1)
    : page.path;
  const path = withoutRoot.endsWith('.md') ? withoutRoot.slice(0, -3) : withoutRoot;

  return {
    kind: 'page',
    path,
    title: VaultPath.pageName(page.path),
    breadcrumb: VaultPath.parentDirectory(path) || null,
  };
}
