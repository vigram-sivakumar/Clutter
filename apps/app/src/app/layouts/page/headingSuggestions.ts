import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import { extractHeadingOccurrences } from '@core/vault/ingest/extractors/headingSemantics';
import type { HeadingSuggestion, GetHeadingSuggestions } from '@features/markdown/editor/MarkdownEditor';

import { findPagesByAlias } from './resolveWikiLink';

/**
 * Composes `Vault` + `EffectivePageState` into the editor's injected
 * `GetHeadingSuggestions` boundary — the same pair `resolvePageEmbed.ts`
 * composes, and the same page-lookup logic (literal path, then the sole
 * alias match; an ambiguous or unresolved page yields no suggestions,
 * never a vault-wide fallback). Heading candidates come from
 * `extractHeadingOccurrences` (ADR-032's shared pipeline) against the
 * resolved page's *effective* markdown, so a page open with unsaved
 * heading edits offers up-to-date suggestions, not stale durable ones —
 * consistent with the same live-content principle heading-target embed
 * resolution itself already follows.
 *
 * Matching is case-insensitive substring, mirroring
 * `createWikiLinkSuggester`/`createEmbedSuggester`'s own convention — a
 * deliberately looser rule than `resolvePageEmbed.ts`'s exact-match
 * resolution, the same split already established between "autocomplete
 * suggests broadly" and "resolution matches exactly."
 */
export function createHeadingSuggester(
  vault: Vault,
  effectivePageState: EffectivePageState
): GetHeadingSuggestions {
  return (pagePath, query) => {
    const page = resolvePage(vault, pagePath);
    if (!page) {
      return [];
    }

    const effective = effectivePageState.getPage(page.id);
    const markdown = effective?.markdown ?? page.source.markdown;
    const occurrences = extractHeadingOccurrences(markdown);

    const normalizedQuery = query.trim().toLowerCase();
    const matches = normalizedQuery
      ? occurrences.filter((occurrence) => occurrence.text.toLowerCase().includes(normalizedQuery))
      : occurrences;

    return matches.map(
      (occurrence): HeadingSuggestion => ({ kind: 'heading', heading: occurrence.text, level: occurrence.level })
    );
  };
}

function resolvePage(vault: Vault, pagePath: string): Page | undefined {
  const literal = vault.getPageByPath(`${vault.root}/${pagePath}.md`);
  if (literal) {
    return literal;
  }

  const aliasMatches = findPagesByAlias(vault, pagePath);
  return aliasMatches.length === 1 ? aliasMatches[0] : undefined;
}
