import { formatTagDisplayLabel } from '@core/vault/models/Tag';

/**
 * The injected Tag resolution contract — concrete and Tag-specific, not a
 * generic semantic-token descriptor (same deliberate non-generalization
 * `wikiLinkResolution.ts` documents on itself).
 *
 * `displayLabel` mirrors `WikiLinkResolution`'s field of the same name —
 * added once separator normalization (`Tag.ts`'s `normalizeTagName`) meant
 * a tag's raw occurrence text and its correct at-rest display could
 * genuinely differ ("#Product_design" must display as "#Product design"
 * using whatever casing the vault's *first* occurrence of this logical tag
 * established, not this occurrence's own casing/separator). Computing that
 * requires vault-wide knowledge no single occurrence has, so — unlike the
 * pre-normalization version of this file — the injected resolver is now
 * the one place that computation happens, same boundary reasoning
 * `WikiLinkResolution`'s own doc comment already gives for its alias
 * precedence chain.
 *
 * Still deliberately simpler than `WikiLinkResolution` in two ways:
 * - No `'ambiguous'` status: WikiLink's ambiguity comes from alias
 *   resolution across multiple pages: nothing analogous exists for a flat
 *   tag namespace keyed by `normalizeTagName`.
 * - Both statuses share the same kind of `activate()` (open the tag-scoped
 *   view via `navigation.openTag`) — unlike WikiLink, there is no separate
 *   "create" side effect for an unresolved tag: a `#newtag` comes into
 *   existence automatically once the containing page is saved and
 *   `TagExtractor` re-ingests it, so "unresolved" here only ever means
 *   "not yet observed anywhere in the vault," not "needs to be created."
 */
export type TagResolution =
  | { readonly status: 'resolved'; readonly displayLabel: string; readonly activate: () => void }
  | { readonly status: 'unresolved'; readonly displayLabel: string; readonly activate: () => void };

/**
 * Injected by the feature/app layer — the editor never imports `Vault`,
 * `NavigationRouter`, or any application-layer class itself
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 * `name` is the tag identifier without the leading `#`.
 */
export type ResolveTag = (name: string) => TagResolution;

/**
 * Used when no resolver is injected, or defensively if one is but the
 * caller still needs a value — there is nothing meaningful to activate.
 * `name` is still separator-formatted for display (via
 * `formatTagDisplayLabel`) even with no resolver/vault available, so an
 * editor with no injected Tag resolution at all still shows "#Product
 * design" rather than the raw "#Product_design" — the local, no-vault
 * case `resolveTag.ts`'s own not-yet-ingested fallback also degrades to.
 */
export function fallbackTagResolution(name: string): TagResolution {
  return { status: 'unresolved', displayLabel: formatTagDisplayLabel(name), activate: () => {} };
}
