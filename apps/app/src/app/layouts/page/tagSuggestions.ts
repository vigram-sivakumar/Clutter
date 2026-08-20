import type { Vault } from '@core/vault/models/Vault';
import { normalizeTagName, formatTagDisplayLabel } from '@core/vault/models/Tag';
import type { GetTagSuggestions } from '@features/markdown/editor/codemirror/tag/tagSuggestion';

/**
 * Composes `Vault` into the editor's injected `GetTagSuggestions`
 * boundary — the autocomplete counterpart to `createTagResolver`
 * (`resolveTag.ts`), same file-placement reasoning as
 * `wikiLinkSuggestions.ts`'s `createWikiLinkSuggester`: this is
 * presentation-layer glue, the editor itself never imports `Vault`
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 *
 * Matching mirrors `createWikiLinkSuggester`'s own convention — no fuzzy
 * matching, no ranking beyond a fixed deterministic (alphabetical,
 * case-insensitive) order — but matches against `normalizeTagName`'s
 * identity, not a raw substring: "autocomplete operates on normalized
 * logical identity" (product decision), so typing `#product_design`
 * still finds a tag whose vault-preferred spelling is "Product-design".
 * `Vault.tags()` is already deduplicated one-per-logical-identity by
 * `TagBuilder`/`normalizeTagName`, so no additional dedup step is needed
 * here — every match is already exactly one suggestion per logical tag,
 * displayed via `formatTagDisplayLabel` (separator → space, preferred
 * casing preserved). An empty query returns no suggestions, same as
 * WikiLink's — the popup only offers anything once the user has actually
 * started typing a name.
 *
 * No "create" suggestion, unlike WikiLink's: `resolveTag.ts`'s own doc
 * comment already establishes a tag needs no explicit creation step, so
 * there is nothing to offer beyond existing vault tags.
 */
export function createTagSuggester(vault: Vault): GetTagSuggestions {
  return (query) => {
    const normalizedQuery = normalizeTagName(query.trim());

    if (!normalizedQuery) {
      return [];
    }

    return Array.from(vault.tags())
      .filter((tag) => normalizeTagName(tag.name).includes(normalizedQuery))
      .map((tag) => formatTagDisplayLabel(tag.name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  };
}
