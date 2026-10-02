import type { Vault } from '@core/vault/models/Vault';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import type { MultiSelectSuggestion } from '@components/property-list/PropertyList.types';

import { findPageMatches } from './wikiLinkSuggestions';

/**
 * Autocomplete for the Aliases Property of page `pageId`: other pages
 * matching the typed text by title or alias — the same search WikiLink
 * autocomplete uses (findPageMatches), so `[[UX` and an Aliases "UX" find
 * the same pages. Picking a row adds plain text to this page's aliases
 * (the matched alias, else the page's title); it never links the pages.
 * Aliases aren't unique, so every matching page gets its own row. Same
 * fixed order as WikiLink's suggestions (natural, case-insensitive).
 */
export function createAliasSuggester(
  vault: Vault,
  pageId: string
): (query: string) => MultiSelectSuggestion[] {
  return (query) => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return findPageMatches(vault.pages(), normalizedQuery)
      .filter(({ page }) => page.id !== pageId)
      .map(({ page, alias }): MultiSelectSuggestion => {
        const title = VaultPath.pageName(page.path);
        return {
          key: `${page.id}:${alias ?? ''}`,
          value: alias ?? title,
          label: alias ?? title,
          // Which page an alias comes from; for a title match, nothing —
          // the label already is the page.
          detail: alias !== null ? title : null,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  };
}
