/**
 * The injected Embed autocomplete contract — the resource-scoped
 * counterpart to wikilink/wikiLinkSuggestion.ts's `WikiLinkSuggestion`,
 * same boundary rule (docs/editor-architecture-decisions.md, "Editor/
 * persistence boundary"): the editor never imports `Vault`/
 * `MembershipSelector` itself, it only calls a function the app layer
 * supplies.
 *
 * A single suggestion kind, not a union like WikiLink's `page | create`:
 * there is no `create-resource` Gate operation kind yet (per the approved
 * Resource mutation scope — see ResourceOperations.ts), so unlike a
 * WikiLink referencing a not-yet-created page, an Embed can never offer
 * "create a new resource at this path" as a completion option. Still
 * exported as a union of one so a future kind (if one is ever needed) is
 * an additive change here, not a breaking one at every call site.
 */
export interface EmbedResourceSuggestion {
  readonly kind: 'resource';
  /** Vault-relative, extension included — exactly what gets inserted between `![[` and `]]`. */
  readonly path: string;
  /** Display name — the resource's filename, extension included. */
  readonly title: string;
  /** The resource's parent folder path for display (e.g. "Projects / A"), or null for a root-level resource. */
  readonly breadcrumb: string | null;
  /**
   * The underlying VaultResource's own kind — carried through so the
   * popup row can pick an icon without re-deriving it from `path`'s
   * extension (VaultResourceKind classification lives in exactly one
   * place, SupportedResourceKind.ts, at scan time; this is that already-
   * classified value, not a second guess at render time).
   */
  readonly resourceKind: 'image' | 'pdf';
}

export type EmbedSuggestion = EmbedResourceSuggestion;

/** `query` is the raw text typed after `![[`, never including the brackets themselves. */
export type GetEmbedSuggestions = (query: string) => readonly EmbedSuggestion[];
