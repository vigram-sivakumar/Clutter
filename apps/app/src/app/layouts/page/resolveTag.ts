import type { Vault } from '@core/vault/models/Vault';
import { formatTagDisplayLabel } from '@core/vault/models/Tag';
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
 */
export function createTagResolver(
  navigation: NavigationRouter,
  vault: Vault,
  /**
   * `requireExisting: true` for an archived note: its tags stay clickable only while the tag currently exists
   * in the tag model (a tag whose every use is archived is not an active tag). Default: always opens.
   */
  { requireExisting = false }: { readonly requireExisting?: boolean } = {}
): ResolveTag {
  return (name) => {
    // getTagByName resolves any spelling of the tag's identity in O(1).
    const preferred = vault.getTagByName(name);

    return {
      status: 'resolved',
      displayLabel: formatTagDisplayLabel(preferred?.name ?? name),
      activate: () => {
        if (requireExisting && !vault.getTagByName(name)) {
          return;
        }

        navigation.openTag(name);
      },
    };
  };
}
