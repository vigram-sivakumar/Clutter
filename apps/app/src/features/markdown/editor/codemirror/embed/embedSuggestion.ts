/**
 * The injected Embed autocomplete contract — the resource-scoped
 * counterpart to wikilink/wikiLinkSuggestion.ts's `WikiLinkSuggestion`,
 * same boundary rule (docs/editor-architecture-decisions.md, "Editor/
 * persistence boundary"): the editor never imports `Vault`/
 * `MembershipSelector` itself, it only calls a function the app layer
 * supplies.
 *
 * Three suggestion kinds: `'page'` (a note or Daily Note), `'resource'` (image/PDF targets) and
 * `'heading'` (ADR-032 — a heading within an already-typed page target,
 * `![[Page#`). There is no `create-resource` Gate operation kind (per the
 * approved Resource mutation scope — see `ResourceOperations.ts`), so
 * unlike a WikiLink referencing a not-yet-created page, an Embed can
 * never offer "create a new resource at this path" as a completion
 * option — and a heading can't be "created" ahead of typing it either, so
 * neither kind has a create variant.
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
  /**
   * A loadable URL for the resource's own file, for the popup's thumbnail (an image's picture, a
   * PDF's first page). Absent where the caller has no URL resolver; the row then shows its icon.
   */
  readonly previewUrl?: string;
}

/**
 * A heading suggestion, scoped to one already-resolved page — never a
 * vault-wide heading search (ADR-032's shared heading semantics resolve
 * this against that one page's effective markdown; see
 * `headingSuggestions.ts`). `heading` is the heading's own literal text —
 * exactly what gets inserted after `#`, matching how a resource
 * suggestion's `path` is inserted verbatim rather than a normalized form.
 */
export interface EmbedHeadingSuggestion {
  readonly kind: 'heading';
  readonly heading: string;
  readonly level: number;
}

/**
 * A note (regular or Daily Note) offered as an embed target — `![[Page]]`. Same shape as a
 * WikiLink page suggestion (`wikilink/wikiLinkSuggestion.ts`) minus the alias, and rendered by the
 * same popup row. `path` is vault-relative with no extension, the page's canonical identity — the
 * title/date a row shows, and any date text a search matched, are presentation only.
 */
export interface EmbedPageSuggestion {
  readonly kind: 'page';
  readonly path: string;
  readonly title: string;
  readonly breadcrumb: string | null;
  /** True for a Daily Note: the popup lists it under Daily notes by its short date title, with no path. */
  readonly dailyNote?: boolean;
  /** The page's own emoji, shown in place of the note icon. */
  readonly emoji?: string | null;
}

/** What `![[query` can offer as a target: a note or an asset. */
export type EmbedTargetSuggestion = EmbedPageSuggestion | EmbedResourceSuggestion;

export type EmbedSuggestion = EmbedTargetSuggestion | EmbedHeadingSuggestion;

/**
 * `query` is the raw text typed after `![[`, never including the
 * brackets themselves. Scoped to `EmbedTargetSuggestion` specifically
 * (notes and assets, not the general `EmbedSuggestion` union) — this datasource never
 * returns headings; once a query contains `#`, `embedCompletionSource.ts`
 * switches to `GetEmbedHeadingSuggestions` entirely rather than this one
 * ever needing to produce a mixed result set.
 */
export type GetEmbedSuggestions = (
  query: string
) => readonly EmbedTargetSuggestion[];

/**
 * `pagePath` is the already-typed portion before `#` (the same string
 * `resolvePageEmbed.ts` would resolve a page from); `query` is whatever
 * follows `#` so far. Scoped to headings within that one page only — the
 * app-layer composer must never search headings globally across the
 * vault for this.
 */
export type GetEmbedHeadingSuggestions = (
  pagePath: string,
  query: string
) => readonly EmbedHeadingSuggestion[];
