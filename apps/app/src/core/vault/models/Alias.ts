import type { Page } from './Page';

// An alternate name declared by a page.
//
// Aliases are part of the runtime domain model and are intentionally
// independent of the Markdown parser implementation.
export interface Alias {
  readonly value: string;
}

/**
 * The single identity rule for aliases: two aliases are the same alias
 * when they match ignoring surrounding whitespace and letter case — so
 * "API" and "api" can't both exist, on one page or across pages. Shared by
 * the duplicate and cross-page checks (`PageOperations.updateMetadata`'s
 * guard and the Aliases Property's feedback), never re-derived per caller.
 */
export function normalizeAliasIdentity(alias: string): string {
  return alias.trim().toLowerCase();
}

/** Whether `aliases` already holds `alias` under normalizeAliasIdentity. */
export function hasAlias(aliases: readonly string[], alias: string): boolean {
  const identity = normalizeAliasIdentity(alias);
  return aliases.some((existing) => normalizeAliasIdentity(existing) === identity);
}

/**
 * The page other than `pageId` that already declares `alias` in its
 * frontmatter `aliases`, or null — the cross-page uniqueness rule. Reads
 * `metadata.aliases` (the owned frontmatter value), the same list a save
 * writes. Archived pages count: their aliases still resolve WikiLinks.
 */
export function findAliasOwner(
  pages: Iterable<Page>,
  alias: string,
  pageId: string
): Page | null {
  for (const page of pages) {
    if (page.id !== pageId && hasAlias(page.metadata.aliases ?? [], alias)) {
      return page;
    }
  }

  return null;
}
