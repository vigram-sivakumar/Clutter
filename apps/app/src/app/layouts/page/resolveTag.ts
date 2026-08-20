import type { Vault } from '@core/vault/models/Vault';
import { normalizeTagName, formatTagDisplayLabel } from '@core/vault/models/Tag';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { ResolveTag } from '@features/markdown/editor/MarkdownEditor';

/**
 * Composes `NavigationRouter` (and, as of separator-normalized display,
 * `Vault`) into the editor's injected `ResolveTag` boundary — the editor
 * itself never imports either directly
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 * Mirrors `resolveWikiLink.ts`'s role, deliberately much smaller.
 *
 * `status` is still deliberately NOT a `vault.tags()` existence check —
 * that part of this file's original reasoning is unchanged. A WikiLink's
 * target is a genuinely separate resource that may or may not exist yet;
 * a Tag occurrence *is* its own definition, per the locked model in
 * `tagResolution.ts`'s own doc comment, so `status` stays unconditionally
 * `'resolved'` regardless of what `Vault` does or doesn't know yet — never
 * flickering to "unresolved" purely due to save/ingest timing.
 *
 * `Vault` is now used for exactly one thing: looking up the *preferred*
 * display casing for this tag's logical identity, established by whichever
 * occurrence was first ever saved anywhere in the vault
 * (`TagBuilder.build()`'s first-typed-casing-wins rule). A tag not yet
 * found in `Vault` (typed for the first time, not yet saved/re-ingested)
 * falls back to formatting this occurrence's own raw name — the same
 * degrade `fallbackTagResolution` uses when no resolver is injected at
 * all — so display never depends on save timing either, only casing does
 * (and only until the first save settles it).
 *
 * Deliberately NOT `vault.getTagByName()` — that method is an exact,
 * as-typed-casing lookup by design (its own doc comment: "callers that
 * only have a differently-cased name should normalize before calling
 * this"), never a normalized-identity one. A linear scan over
 * `vault.tags()` matching by `normalizeTagName` is the same pattern
 * `tagSuggestions.ts`'s `createTagSuggester` already uses for identical
 * reasons — consistent with how `TagBuilder`/`TagOperations` do their own
 * normalized comparisons independently, never through `getTagByName`.
 */
export function createTagResolver(navigation: NavigationRouter, vault: Vault): ResolveTag {
  return (name) => {
    const identity = normalizeTagName(name);
    const preferred = Array.from(vault.tags()).find((tag) => normalizeTagName(tag.name) === identity);

    return {
      status: 'resolved',
      displayLabel: formatTagDisplayLabel(preferred?.name ?? name),
      activate: () => navigation.openTag(name),
    };
  };
}
