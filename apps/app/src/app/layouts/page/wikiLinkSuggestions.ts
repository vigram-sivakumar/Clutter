import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { Folder } from '@core/vault/models/Folder';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { isDailyNotesCollectionPagesEnabled } from '@core/featureFlags';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { getSystemLocationIconForFolder } from '@core/presentation/systemPresentation';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { dailyNoteSearchText } from '@core/presentation/dailyNoteSearchText';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';
import { matchesSearchText } from '@shared/helpers/matchesSearchText';
import { resolveEffectivePageDates } from '@core/vault/models/effectivePageDates';
import { foldString } from '@core/application/search/foldText';
import { parseQuery, tokenMatches } from '@core/application/search/matchPage';
import type {
  GetWikiLinkSuggestions,
  WikiLinkAssetSuggestion,
  WikiLinkFolderSuggestion,
  WikiLinkPageSuggestion,
  WikiLinkSuggestion,
} from '@features/markdown/editor/MarkdownEditor';

import { rankByMatchQuality, sortByLastEdited, type RankEntry } from './suggestionRanking';
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
 * fuzzy matching, no ranking beyond a fixed deterministic order. This is
 * deliberately separate from the Search overlay's `SearchService`
 * (`core/application/search`, ADR-061), which ranks across titles, aliases,
 * tags and body text: autocomplete picks one page to link to, and stays the
 * simplest title/alias match.
 *
 * Folders and asset files are offered alongside the notes (their own popup sections) when a
 * `membershipSelector` is given — the same source of "what is visible" the pickers and the Assets
 * collection use, so an archived or hidden folder or file is never offered. A folder is matched by its
 * name, an asset by its file name (extension included); a query with a `/` in it is matched against the
 * whole path instead, so `Projects/` and `Assets/he` narrow by location. This is separate from the embed
 * suggester (`embedSuggestions.ts`), which is not touched.
 */
export function createWikiLinkSuggester(
  vault: Vault,
  pageOperations: PageOperations,
  folderOperations: FolderOperations,
  /**
   * Whether a page is archived (itself, or inside an archived folder). Archived pages are not
   * offered: the popup lists what the user can see and edit, the same pages the pickers offer.
   * Default: the vault's own rule, `Vault.isPageEffectivelyArchived`.
   */
  isArchived: (page: Page) => boolean = (page) => vault.isPageEffectivelyArchived(page),
  /** Told when creating the note an accepted "Create" suggestion names failed. Default: logs it. */
  onCreateFailed?: (error: unknown) => void,
  /** Without it, only notes (and Create) are offered, as before. */
  membershipSelector?: MembershipSelector,
  /** A loadable URL for an asset's file (its absolute path), for the popup's thumbnail — the embed popup's own. */
  resolveResourceUrl?: (path: string) => string,
  /** The Space's name: a reserved folder lives at the Space's top level, so it is shown as "in" it. */
  spaceName?: string
): GetWikiLinkSuggestions {
  const livePages = () => Array.from(vault.pages()).filter((page) => !isArchived(page));

  return (query) => {
    const trimmed = query.trim();

    // Empty query: a freshly typed `[[` (closeBrackets already produces the closed, empty `[[]]` node before
    // any character is typed) — show the notes, Daily Notes and templates (all pages) most recently edited
    // first, rather than nothing, so autocomplete opens immediately. No folders or assets, and no Create option:
    // an empty path has nothing to create yet.
    if (!trimmed) {
      return sortByLastEdited(livePages(), lastEditedMs, (page) => page.name).map((page) => toPageSuggestion(vault, page));
    }

    const ranked = rankTargets(
      vault,
      trimmed,
      livePages(),
      membershipSelector,
      resolveResourceUrl,
      spaceName
    );

    if (ranked.length > 0) {
      return ranked;
    }

    // Mirrors PickerList's own rule exactly (PickerList.tsx's
    // `showCreate`): a Create option is offered only when the search
    // produces zero matches, never alongside real results.
    const path = trimmed;
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
        void createReferencedPage(vault, folderOperations, pageOperations, path, false).catch((error: unknown) =>
          onCreateFailed ? onCreateFailed(error) : console.error('Creating the linked note failed', error)
        );
      },
    };

    return [suggestion];
  };
}

/** When a page was last edited (epoch ms) — the file's own time (ADR-057), else its creation; 0 when unknown. */
export function lastEditedMs(page: Page): number {
  const dates = resolveEffectivePageDates(page);

  return Date.parse(dates.updatedAt ?? dates.createdAt ?? '') || 0;
}

/**
 * Every target a typed query can name — notes, Daily Notes and templates (pages), folders (reserved ones
 * included) and asset files — as ONE list ordered by match quality, by the search overlay's own ranking
 * (`rankPages`, with `parseQuery` and its relevance rules). Titles and aliases are what is matched; there is no
 * body to look in. A query with a `/` in it is matched against the whole path as linked (`Projects/`,
 * `Assets/he`) instead of the name, so it narrows by location.
 */
function rankTargets(
  vault: Vault,
  rawQuery: string,
  pages: readonly Page[],
  membershipSelector: MembershipSelector | undefined,
  resolveResourceUrl: ((path: string) => string) | undefined,
  spaceName: string | undefined
): WikiLinkSuggestion[] {
  const byPath = rawQuery.includes('/');
  const pageByTarget = new Map<string, Page>();
  const entries: RankEntry<WikiLinkSuggestion>[] = [];
  const add = (suggestion: WikiLinkSuggestion, name: string, aliases: readonly string[], updatedMs: number): void => {
    entries.push({
      key: `${suggestion.kind}:${suggestion.path}`,
      suggestion,
      title: byPath ? suggestion.path : name,
      aliases,
      updatedMs,
    });
  };

  for (const page of pages) {
    const suggestion = toPageSuggestion(vault, page);
    const name = VaultPath.pageName(page.path);
    pageByTarget.set(`page:${suggestion.path}`, page);
    add(
      suggestion,
      page.type === 'daily-note' ? dailyNoteSearchText(name) : name,
      page.analysis.aliases.map((alias) => alias.value),
      lastEditedMs(page)
    );
  }

  if (membershipSelector) {
    for (const folder of vault.folders()) {
      if (
        membershipSelector.isVisibleFolder(folder) &&
        !membershipSelector.isEntityEffectivelyArchived(folder) &&
        // The Daily Notes year / month folders have no page of their own to open (unless that is enabled).
        (isDailyNotesCollectionPagesEnabled() || DailyNotePath.folderLevel(vault.root, folder.path) === null)
      ) {
        add(toFolderSuggestion(vault, folder, membershipSelector, spaceName), folder.name, [], 0);
      }
    }

    for (const resource of membershipSelector.getAllVisibleResources()) {
      const suggestion = toAssetSuggestion(vault, resource, resolveResourceUrl);
      // The file name with its extension, so `hero.p` finds `hero.png`.
      add(suggestion, VaultPath.filename(suggestion.path), [], Date.parse(resource.metadata?.modifiedAt ?? '') || 0);
    }
  }

  const tokens = parseQuery(rawQuery)?.tokens ?? [];

  return rankByMatchQuality(rawQuery, entries).map(({ suggestion, matchedBy }) => {
    // A page found by an alias carries it, so accepting inserts `[[full/path|Alias]]`.
    if (matchedBy === 'alias' && suggestion.kind === 'page') {
      const page = pageByTarget.get(`page:${suggestion.path}`);
      const alias = page && matchedAlias(page, tokens);

      return alias ? { ...suggestion, alias } : suggestion;
    }

    return suggestion;
  });
}

/** The alias a query found a page by: one holding every word, an exact one first; else the first declared. */
function matchedAlias(page: Page, tokens: readonly string[]): string | undefined {
  const aliases = page.analysis.aliases.map((alias) => alias.value);
  const holdsAll = (alias: string) => tokens.every((token) => tokenMatches(foldString(alias), token));

  return (
    aliases.find((alias) => foldString(alias) === tokens.join(' ')) ?? aliases.find(holdsAll) ?? aliases[0]
  );
}

/** A folder as the link that names it: its trailing slash (`Projects/`) keeps it from being read as a note of the same name. */
function toFolderSuggestion(
  vault: Vault,
  folder: Folder,
  membershipSelector: MembershipSelector,
  spaceName: string | undefined
): WikiLinkFolderSuggestion {
  const relative = VaultPath.relativeTo(folder.path, vault.root);
  // A reserved folder's own icon, from the one shared presentation table; any other folder its own emoji.
  const systemIcon = getSystemLocationIconForFolder(folder, membershipSelector);
  const identity = systemIcon ? { icon: systemIcon } : folder.metadata.icon ? { emoji: folder.metadata.icon } : {};
  // A reserved folder sits at the Space's top level: its path is the Space's name.
  const breadcrumb = membershipSelector.isSystemFolder(folder)
    ? [spaceName, VaultPath.parentDirectory(relative)].filter(Boolean).join('/') || null
    : VaultPath.parentDirectory(relative) || null;

  return { kind: 'folder', path: `${relative}/`, title: folder.name, breadcrumb, ...identity };
}

/** An asset by its vault-relative path with its extension (`Assets/hero.png`). */
function toAssetSuggestion(
  vault: Vault,
  resource: VaultResource,
  resolveResourceUrl: ((path: string) => string) | undefined
): WikiLinkAssetSuggestion {
  const relative = VaultPath.relativeTo(resource.path, vault.root);

  return {
    kind: 'asset',
    path: relative,
    title: getResourceDisplayName(resource),
    breadcrumb: VaultPath.parentDirectory(relative) || null,
    assetKind: resource.kind,
    ...(resolveResourceUrl && { previewUrl: resolveResourceUrl(resource.path) }),
  };
}

/**
 * The order of page suggestions: notes by title (natural/alphanumeric), then Daily Notes by their
 * calendar date, newest first. A Daily Note's title is its ISO `YYYY-MM-DD` name, so the date is
 * compared as a value — never by the label the app shows, which doesn't sort chronologically.
 * Notes and Daily Notes are separate popup sections, so their relative order is unchanged.
 */
export function sortPageSuggestions<T extends WikiLinkPageSuggestion>(suggestions: readonly T[]): T[] {
  const byTitle = (a: T, b: T) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
  const byDateNewestFirst = (a: T, b: T) => {
    const aValid = isValidCalendarDate(a.title);
    const bValid = isValidCalendarDate(b.title);
    if (aValid && bValid) {
      return a.title < b.title ? 1 : a.title > b.title ? -1 : 0;
    }
    // A Daily Note with an unreadable name sorts after the dated ones, by title.
    return aValid ? -1 : bValid ? 1 : byTitle(a, b);
  };

  return [
    ...suggestions.filter((s) => !s.dailyNote).sort(byTitle),
    ...suggestions.filter((s) => s.dailyNote).sort(byDateNewestFirst),
  ];
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
