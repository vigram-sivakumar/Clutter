import type { Vault } from '@core/vault/models/Vault';
import type { MultiSelectSuggestion } from '@components/property-list/PropertyList.types';

/**
 * Autocomplete for the Aliases Property of page `pageId`: the **aliases that
 * already exist in the vault** — the `aliases` frontmatter values of every
 * page — matching the typed text, the counterpart to Tags' autocomplete
 * (tagSuggestions.ts: existing tags in the vault).
 *
 * This is deliberately not WikiLink's page discovery (wikiLinkSuggestions.ts,
 * `findPageMatches`): no page titles, paths or content are searched, and a
 * row is a plain *value*, never a page — another note having the alias
 * `Dashboard` only means `Dashboard` is a known alias; picking it adds that
 * text to this page's aliases and links nothing.
 *
 * - Aliases of all pages are flattened and trimmed; empty values are dropped.
 * - Duplicates are one suggestion, compared ignoring letter case. Its
 *   spelling is the one used most often across the vault (ties: natural,
 *   case-insensitive order), so the display is stable and not tied to
 *   whichever page happens to be read first.
 * - Aliases already on this page (any letter case) are not offered again.
 * - Matching is case-insensitive and by word start: the alias, or any word in
 *   it, begins with the typed text (`h` finds "Heyo" and "Hello world", not
 *   "UI architecture"; `sys` finds "Design system"). No fuzzy matching.
 *   An empty query suggests nothing — the popup only offers anything once the
 *   user has started typing. Results are in the same fixed natural,
 *   case-insensitive order as every other suggestion list here.
 *
 * Built from `Vault.pages()` and each page's `metadata.aliases` — the very
 * value the Aliases Property shows and edits — so there is no second index
 * or scanner, and nothing about how aliases are stored changes.
 */
export function createAliasSuggester(
  vault: Vault,
  pageId: string
): (query: string) => MultiSelectSuggestion[] {
  const compare = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  return (query) => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    const own = new Set<string>();
    // lower-cased alias → how often each spelling occurs across the vault
    const spellings = new Map<string, Map<string, number>>();

    for (const page of vault.pages()) {
      for (const raw of page.metadata.aliases ?? []) {
        const alias = raw.trim();

        if (alias === '') {
          continue;
        }

        const key = alias.toLowerCase();

        if (page.id === pageId) {
          own.add(key);
        }

        const counts = spellings.get(key) ?? new Map<string, number>();
        counts.set(alias, (counts.get(alias) ?? 0) + 1);
        spellings.set(key, counts);
      }
    }

    const suggestions: MultiSelectSuggestion[] = [];

    for (const [key, counts] of spellings) {
      if (own.has(key) || !(key.startsWith(normalizedQuery) || key.includes(` ${normalizedQuery}`))) {
        continue;
      }

      // Most used spelling first; ties by natural order, then by exact text — total, so never order-dependent.
      const [display] = [...counts].sort(
        ([a, countA], [b, countB]) => countB - countA || compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
      )[0]!;
      suggestions.push({ key, value: display, label: display, detail: null });
    }

    return suggestions.sort((a, b) => compare(a.label, b.label));
  };
}
