import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { dailyNoteSearchText } from '@core/presentation/dailyNoteSearchText';
import { matchesSearchText } from '@shared/helpers/matchesSearchText';
import type {
  GetWikiLinkSuggestions,
  WikiLinkPageSuggestion,
  WikiLinkSuggestion,
} from '@features/markdown/editor/MarkdownEditor';

import { canCreateReferencedPage, createReferencedPage } from './resolveWikiLink';

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
 * page's title and its `analysis.aliases` (findPageMatches) — the exact algorithm
 * `PickerList.tsx` already uses for folder names
 * (`item.title.toLowerCase().includes(normalizedQuery)`), extended only to
 * also check aliases, since WikiLinks (unlike folder names) already
 * resolve through them (`resolveWikiLink.ts`'s `findPagesByAlias`). A
 * page found by an alias carries it, so accepting inserts
 * `[[full/path|Alias]]` — the canonical path stays the target, the alias
 * is only the display text. No
 * fuzzy matching, no ranking beyond a fixed deterministic order — this
 * codebase has no existing search/fuzzy-match implementation to build on
 * (confirmed: `features/search/SearchPanel.tsx` is an unimplemented stub),
 * so inventing one here would be new, unreviewed matching infrastructure
 * for a single caller.
 */
export function createWikiLinkSuggester(
  vault: Vault,
  pageOperations: PageOperations,
  folderOperations: FolderOperations,
  /**
   * Whether a page is archived (itself, or inside an archived folder) — the workspace's own rule,
   * `MembershipSelector`'s. Archived pages are not offered: the popup lists what the user can see
   * and edit, the same pages the pickers offer. Default: none are.
   */
  isArchived: (page: Page) => boolean = () => false
): GetWikiLinkSuggestions {
  const livePages = () => Array.from(vault.pages()).filter((page) => !isArchived(page));

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
      return livePages().map((page) => toPageSuggestion(vault, page)).sort(byTitle);
    }

    const matches = findPageMatches(livePages(), normalizedQuery, (page) => page.type === 'daily-note')
      .map(({ page, alias }) => toPageSuggestion(vault, page, alias))
      .sort(byTitle);

    if (matches.length > 0) {
      return matches;
    }

    // Mirrors PickerList's own rule exactly (PickerList.tsx's
    // `showCreate`): a Create option is offered only when the search
    // produces zero matches, never alongside real results.
    const path = query.trim();
    // Nothing to offer for a path a link may not create (inside the Daily Notes folder).
    if (!canCreateReferencedPage(vault, path)) {
      return [];
    }
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

/** A page matching a search, and the alias it matched by (null when its title matched). */
export interface PageMatch {
  readonly page: Page;
  readonly alias: string | null;
}

/**
 * The one page search shared by WikiLink autocomplete and the Aliases
 * Property's suggestions: case-insensitive substring match against a
 * page's title, else its aliases. A title match wins (alias null); else
 * the alias that matched — an exact (case-insensitive) alias over a
 * merely containing one, then the first declared — so `[[UX` offers the
 * page as "UX", never a longer alias that happens to contain it. Every
 * matching page is returned: aliases aren't unique, so several pages can
 * match by the same alias. `normalizedQuery` is already trimmed and
 * lower-cased, and must be non-empty.
 */
export function findPageMatches(
  pages: Iterable<Page>,
  normalizedQuery: string,
  isDailyNote: (page: Page) => boolean = () => false
): PageMatch[] {
  const matches: PageMatch[] = [];

  for (const page of pages) {
    const name = VaultPath.pageName(page.path);
    if (name.toLowerCase().includes(normalizedQuery)) {
      matches.push({ page, alias: null });
      continue;
    }

    // A Daily Note's name is its ISO date, but it is read (and so searched for) as the date the
    // app writes — `Aug`, `Aug 24`, `Monday` — which the stored name alone would never match.
    if (isDailyNote(page) && matchesSearchText(dailyNoteSearchText(name), normalizedQuery)) {
      matches.push({ page, alias: null });
      continue;
    }

    const aliases = page.analysis.aliases.map((alias) => alias.value);
    const alias =
      aliases.find((value) => value.toLowerCase() === normalizedQuery) ??
      aliases.find((value) => value.toLowerCase().includes(normalizedQuery));

    if (alias !== undefined) {
      matches.push({ page, alias });
    }
  }

  return matches;
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
export function toPageSuggestion(
  vault: Vault,
  page: Page,
  alias: string | null = null
): WikiLinkPageSuggestion {
  const withoutRoot = page.path.startsWith(`${vault.root}/`)
    ? page.path.slice(vault.root.length + 1)
    : page.path;
  const path = withoutRoot.endsWith('.md') ? withoutRoot.slice(0, -3) : withoutRoot;

  return {
    kind: 'page',
    path,
    title: VaultPath.pageName(page.path),
    breadcrumb: VaultPath.parentDirectory(path) || null,
    // Only on an alias match, so a title match's shape is unchanged.
    ...(alias !== null && { alias }),
    // What the popup row needs to read like the note picker's: a Daily Note is listed by its date,
    // a note by its own emoji.
    ...(page.type === 'daily-note' && { dailyNote: true }),
    ...(page.metadata.icon && { emoji: page.metadata.icon }),
  };
}
