/**
 * The injected Tag resolution contract — concrete and Tag-specific, not a
 * generic semantic-token descriptor (same deliberate non-generalization
 * `wikiLinkResolution.ts` documents on itself).
 *
 * Deliberately simpler than `WikiLinkResolution`:
 * - No `displayLabel`: a tag's raw form and at-rest display form are the
 *   same text (`#project` renders as `#project`, just styled) — there is
 *   no alias/precedence computation the way WikiLink has, so nothing here
 *   computes what to show; the widget renders the raw matched text as-is.
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
  | { readonly status: 'resolved'; readonly activate: () => void }
  | { readonly status: 'unresolved'; readonly activate: () => void };

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
 */
export function fallbackTagResolution(): TagResolution {
  return { status: 'unresolved', activate: () => {} };
}
