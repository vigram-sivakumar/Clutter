import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import {
  extractHeadingOccurrences,
  findFirstHeadingOccurrence,
  type HeadingOccurrence,
} from '@core/vault/ingest/extractors/headingSemantics';
import type { PageEmbedResolution, ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';

import { findPagesByAlias } from './resolveWikiLink';
import { resolvePageIdentityIcon } from './resolvePageIdentityIcon';

/**
 * Composes `Vault` + `EffectivePageState` into the editor layer's injected
 * `ResolvePageEmbed` boundary — the CM6 note-embed rendering path
 * (`embedLivePreview.ts`/`NoteEmbedWidget.ts`) never imports either
 * directly (same "editor/feature layer never imports Vault directly"
 * boundary `resolveWikiLink.ts`/`resolveEmbedImage.ts` already respect).
 * Path/alias lookup reuses `resolveWikiLink.ts`'s exact literal-
 * path-then-alias-fallback rule (`findPagesByAlias`, exported from there)
 * rather than a second implementation of the same target-resolution logic
 * — a note embed's `![[path|alias]]` names exactly the same kind of
 * reference a WikiLink's `[[path|alias]]` does.
 *
 * Content resolution is the one deliberate difference from
 * `resolveWikiLink.ts`: `EffectivePageState.getPage(id).markdown` (session-
 * wins-over-committed, ADR-020's existing precedence) rather than
 * `page.source.markdown` — an embedded note reflects the referenced page's
 * *current* content, including a live, unsaved edit, not just what was
 * last saved. `EffectivePageState.getPage()` is synchronous and side-
 * effect-free (safe to call once per render), so this needs no new
 * subscription/session-awareness of its own.
 *
 * Heading-target embeds (`![[Page#Heading]]`, ADR-032): the target is
 * split on the first unescaped `#` (mirroring `LinkExtractor`/
 * `EmbedExtractor`'s own inline split, at Vault Ingest's ingest-time
 * granularity — this resolver's `path` is already a pre-extracted target
 * string from `scanEmbed`, a different input shape, so the two-line split
 * itself is duplicated rather than shared; the actual heading-matching
 * algorithm is not). Heading lookup and matching reuse
 * `extractHeadingOccurrences`/`findFirstHeadingOccurrence`
 * (`headingSemantics.ts`, ADR-032's shared, already-public heading
 * pipeline) against the *effective* markdown, never `Page.analysis.headings`
 * (durable-only) — keeping heading resolution consistent with the same
 * live-content principle embed content itself already follows. Section
 * boundaries are computed directly from the already-public
 * `HeadingOccurrence.from`/`.level` fields returned by
 * `extractHeadingOccurrences` — no new Vault Ingest export, no second
 * heading parser.
 */
export function createPageEmbedResolver(vault: Vault, effectivePageState: EffectivePageState): ResolvePageEmbed {
  function resolvedTo(page: Page, headingQuery: string | null): PageEmbedResolution {
    const effective = effectivePageState.getPage(page.id);
    const markdown = effective?.markdown ?? page.source.markdown;
    const name = effective?.name ?? '';
    const pageTitle = name.trim().length > 0 ? name : VaultPath.pageName(page.path);
    // The single shared source of truth for a resolved page's own
    // identity icon/emoji — the exact same computation
    // `resolveWikiLink.ts`'s own resolved WikiLink form uses, so the two
    // constructs can never silently diverge. See that module's own doc
    // comment for the full rationale.
    const { icon, emoji } = resolvePageIdentityIcon(
      page,
      effective,
      vault.isFolderWithinReservedFolder(page.parentId, 'templates')
    );

    if (headingQuery === null) {
      return { status: 'resolved', pageId: page.id, title: pageTitle, markdown, icon, emoji };
    }

    const section = resolveHeadingSection(markdown, headingQuery);
    if (!section) {
      return { status: 'unresolved-heading', pageId: page.id, displayLabel: `${pageTitle} › ${headingQuery.trim()}` };
    }

    return {
      status: 'resolved',
      pageId: page.id,
      title: `${pageTitle} › ${section.headingText}`,
      markdown: markdown.slice(section.from, section.to),
      icon,
      emoji,
    };
  }

  return (path) => {
    const { pagePath, headingQuery } = splitEmbedTarget(path);

    const literal = vault.getPageByPath(`${vault.root}/${pagePath}.md`);
    if (literal) {
      return resolvedTo(literal, headingQuery);
    }

    const aliasMatches = findPagesByAlias(vault, pagePath);
    if (aliasMatches.length === 1) {
      return resolvedTo(aliasMatches[0] as Page, headingQuery);
    }

    if (aliasMatches.length > 1) {
      return { status: 'ambiguous', displayLabel: VaultPath.pageName(pagePath) };
    }

    return { status: 'unresolved', displayLabel: VaultPath.pageName(pagePath) };
  };
}

/**
 * `![[Page#Heading]]` scans today (`scanEmbed`/`scanWikiLink`) with `#` as
 * an ordinary path character — `path` here is `"Page#Heading"` in full.
 * Splits on the first `#`, mirroring `LinkExtractor.ts`/`EmbedExtractor.ts`'s
 * own identical split (see this file's own doc comment for why that isn't
 * imported directly). A `^`-prefixed fragment (block reference syntax) is
 * deliberately out of scope — it falls through to an ordinary heading
 * lookup, which will simply not match any real heading text, the same
 * `'unresolved-heading'` outcome a genuinely wrong heading name gets.
 */
function splitEmbedTarget(path: string): { pagePath: string; headingQuery: string | null } {
  const hashIndex = path.indexOf('#');
  if (hashIndex === -1) {
    return { pagePath: path, headingQuery: null };
  }
  return { pagePath: path.slice(0, hashIndex), headingQuery: path.slice(hashIndex + 1) };
}

/**
 * Exact text match (trimmed), first match in document order — the shared
 * `findFirstHeadingOccurrence` rule, never re-decided here. The section
 * is `[matched heading's own start, next occurrence with level <= the
 * matched heading's level, or end of document)` — the matched heading's
 * own line is included in the result (a product decision, not a parser
 * fact: the note-embed rendering path (`NoteEmbedWidget.ts`) renders
 * whatever markdown span it's given, and a heading section without its
 * own heading would read oddly as embedded content).
 */
function resolveHeadingSection(
  markdown: string,
  headingQuery: string
): { from: number; to: number; headingText: string } | null {
  const occurrences = extractHeadingOccurrences(markdown);
  const match = findFirstHeadingOccurrence(occurrences, headingQuery.trim());
  if (!match) {
    return null;
  }

  const matchIndex = occurrences.indexOf(match);
  const nextBoundary = findNextBoundary(occurrences, matchIndex, match.level);

  return { from: match.from, to: nextBoundary?.from ?? markdown.length, headingText: match.text };
}

function findNextBoundary(
  occurrences: readonly HeadingOccurrence[],
  matchIndex: number,
  matchLevel: number
): HeadingOccurrence | undefined {
  for (let i = matchIndex + 1; i < occurrences.length; i++) {
    const occurrence = occurrences[i];
    if (occurrence && occurrence.level <= matchLevel) {
      return occurrence;
    }
  }
  return undefined;
}
