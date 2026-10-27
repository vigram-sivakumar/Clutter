import type { Vault } from '@core/vault/models/Vault';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { Page } from '@core/vault/models/Page';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import { dailyNoteSearchText } from '@core/presentation/dailyNoteSearchText';
import { matchesSearchText } from '@shared/helpers/matchesSearchText';
import type {
  EmbedResourceSuggestion,
  EmbedTargetSuggestion,
  GetEmbedSuggestions,
} from '@features/markdown/editor/MarkdownEditor';
import { lastEditedMs, toPageSuggestion } from './wikiLinkSuggestions';
import { rankByMatchQuality, sortByLastEdited, type RankEntry } from './suggestionRanking';

/**
 * Composes `Vault` + `MembershipSelector` into the editor's injected
 * `GetEmbedSuggestions` boundary — the Embed-scoped counterpart to
 * `wikiLinkSuggestions.ts`'s `createWikiLinkSuggester`. Sources from
 * `MembershipSelector.getAllVisibleResources()` — already the single
 * source of truth for "every visible resource in the vault" (the same
 * query the Assets collection view already uses) — never a second
 * resource collection/query and never a filesystem scan.
 *
 * Matching differs from `createWikiLinkSuggester`'s in one deliberate way:
 * it matches against each resource's full vault-relative path (folder
 * included), not just its filename. This is required, not a stylistic
 * choice — the product spec calls for folder-qualified queries to work
 * (`![[Projects/` showing resources under `Projects/`, `![[Projects/hero`
 * filtering further), which a filename-only match (the existing WikiLink
 * suggester's own behavior) cannot do. A resource's relative path already
 * ends with its filename, so a single substring check against the full
 * path serves both the bare-filename case and the folder-qualified case
 * with no special-casing between them.
 *
 * `![[` offers everything that can be embedded, by type: the assets
 * (`MembershipSelector.getAllVisibleResources()` — images, PDFs), then notes and Daily Notes. Notes are listed and shaped
 * exactly as `[[` lists them (`toPageSuggestion`), matched by the same path text, with a Daily
 * Note also found by the date the app writes (`dailyNoteSearchText`). One pipeline, one match per
 * kind — the popup's sections (Notes / Daily notes / Images / PDFs) are decided by the row, and
 * each is capped by `limitCompletionSections`, which sees the combined result.
 */
export function createEmbedSuggester(
  vault: Vault,
  membershipSelector: MembershipSelector,
  /** A loadable URL for a resource's file (its absolute path), for the popup's thumbnail. */
  resolveResourceUrl?: (path: string) => string,
  /**
   * Whether a note is archived (itself, or inside an archived folder). Archived notes — Daily Notes
   * included — are not offered. Default: the vault's own rule, `Vault.isPageEffectivelyArchived`.
   */
  isArchived: (page: Page) => boolean = (page) => vault.isPageEffectivelyArchived(page)
): GetEmbedSuggestions {
  const embeddablePages = () => Array.from(vault.pages()).filter((page) => !isArchived(page));

  return (query) => {
    const normalizedQuery = query.trim().toLowerCase();
    const allResources = () => membershipSelector.getAllVisibleResources();
    const modifiedMs = (resource: VaultResource) => Date.parse(resource.metadata?.modifiedAt ?? '') || 0;

    // Empty query: a freshly typed `![[` — the assets (images and PDFs), since embedding media is its main use,
    // most recently modified first; one with no usable time goes after every dated one, alphabetically by path.
    // Notes are not listed until something is typed.
    if (!normalizedQuery) {
      return sortByLastEdited(allResources(), modifiedMs, (resource) => relativePath(vault, resource)).map((resource) =>
        toResourceSuggestion(vault, resource, resolveResourceUrl)
      );
    }

    // Typed: the same targets and the same match rule as ever (a note or an asset whose vault-relative path holds
    // the query, a Daily Note also by its date text) — in one list, ordered by match quality, not by kind.
    const byPath = query.includes('/');
    const entries: RankEntry<EmbedTargetSuggestion>[] = [
      ...embeddablePages()
        .filter((page) => matchesPage(vault, page, normalizedQuery))
        .map((page): RankEntry<EmbedTargetSuggestion> => {
          const { alias: _alias, ...suggestion } = toPageSuggestion(vault, page);
          const name = VaultPath.pageName(page.path);

          return {
            key: `page:${suggestion.path}`,
            suggestion,
            title: byPath ? suggestion.path : page.type === 'daily-note' ? dailyNoteSearchText(name) : name,
            updatedMs: lastEditedMs(page),
          };
        }),
      ...allResources()
        .filter((resource) => matchesQuery(vault, resource, normalizedQuery))
        .map((resource): RankEntry<EmbedTargetSuggestion> => {
          const suggestion = toResourceSuggestion(vault, resource, resolveResourceUrl);

          return {
            key: `resource:${suggestion.path}`,
            suggestion,
            title: byPath ? suggestion.path : VaultPath.filename(suggestion.path),
            updatedMs: modifiedMs(resource),
          };
        }),
    ];

    // Everything here already matched by path; the ranking only orders it (a match it cannot place goes last).
    return rankByMatchQuality(query, entries, true).map(({ suggestion }) => suggestion);
  };
}

/**
 * A note matches by its vault-relative path (folder included, like a resource — so `![[Projects/`
 * works for notes too), or, for a Daily Note, by the date text it is read as.
 */
function matchesPage(vault: Vault, page: Page, normalizedQuery: string): boolean {
  const { path, title } = toPageSuggestion(vault, page);
  if (path.toLowerCase().includes(normalizedQuery)) {
    return true;
  }
  return page.type === 'daily-note' && matchesSearchText(dailyNoteSearchText(title), normalizedQuery);
}

/**
 * `resource.path` is root-prefixed (Vault's own storage shape, same as
 * `Page.path`); Embed targets are vault-relative, extension INCLUDED
 * (unlike a WikiLink target, which strips `.md` — see
 * `resolveResourceEmbed.ts`'s own doc comment on why resources are never
 * de-extensioned).
 */
function relativePath(vault: Vault, resource: VaultResource): string {
  return resource.path.startsWith(`${vault.root}/`)
    ? resource.path.slice(vault.root.length + 1)
    : resource.path;
}

function matchesQuery(vault: Vault, resource: VaultResource, normalizedQuery: string): boolean {
  return relativePath(vault, resource).toLowerCase().includes(normalizedQuery);
}

function toResourceSuggestion(
  vault: Vault,
  resource: VaultResource,
  resolveResourceUrl: ((path: string) => string) | undefined
): EmbedResourceSuggestion {
  const path = relativePath(vault, resource);

  return {
    kind: 'resource',
    path,
    title: getResourceDisplayName(resource),
    breadcrumb: VaultPath.parentDirectory(path) || null,
    resourceKind: resource.kind,
    ...(resolveResourceUrl && { previewUrl: resolveResourceUrl(resource.path) }),
  };
}
