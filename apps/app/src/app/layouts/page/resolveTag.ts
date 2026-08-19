import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { ResolveTag } from '@features/markdown/editor/MarkdownEditor';

/**
 * Composes `NavigationRouter` into the editor's injected `ResolveTag`
 * boundary — the editor itself never imports it
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 * Mirrors `resolveWikiLink.ts`'s role, deliberately much smaller.
 *
 * Deliberately NOT a `vault.tags()` existence check, unlike an earlier
 * version of this file. A WikiLink's target is a genuinely separate
 * resource that may or may not exist yet — checking `Vault` is meaningful.
 * A Tag has no such separate existence: `resolveTag` is only ever called
 * for a `Tag` node that already exists in the syntax tree of the document
 * currently open in the editor (`tagDecorations.ts`/`tagActivation.ts`
 * only invoke it on real matched nodes) — the occurrence *is* the
 * definition, with no separate creation step, per the locked model in
 * `tagResolution.ts`'s own doc comment. `vault.tags()` only reflects
 * already-persisted, already-`TagExtractor`-ingested content, so checking
 * it here would make a tag typed in the still-unsaved current document
 * flicker as "unresolved" purely due to save/ingest timing — not a real
 * distinction, just a lag artifact. Always resolved; `Vault` is
 * deliberately not even a parameter here, so a future reader isn't
 * tempted to reintroduce the timing-dependent check.
 */
export function createTagResolver(navigation: NavigationRouter): ResolveTag {
  return (name) => ({ status: 'resolved', activate: () => navigation.openTag(name) });
}
