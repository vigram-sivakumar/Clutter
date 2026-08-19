/**
 * The injected WikiLink autocomplete contract — mirrors
 * `wikiLinkResolution.ts`'s `ResolveWikiLink` shape and the same boundary
 * rule (docs/editor-architecture-decisions.md, "Editor/persistence
 * boundary"): the editor never imports `Vault`/`PageOperations`/
 * `FolderOperations` itself, it only calls a function the app layer
 * supplies.
 *
 * Two suggestion kinds, not a generic one: a `page` suggestion just needs
 * inserting; a `create` suggestion needs the same insert *plus* a
 * fire-and-forget side effect. `create` bundles its own behavior
 * (`create: () => void`) the same way `WikiLinkResolution` bundles
 * `activate: () => void` for an unresolved reference's click — the editor
 * never decides what "create" does, only that it must call it.
 */
export interface WikiLinkPageSuggestion {
  readonly kind: 'page';
  /** Vault-relative, no extension — exactly the shape `serializeWikiLink`/`ResolveWikiLink` already use. */
  readonly path: string;
  readonly title: string;
  /** The page's parent path for display (e.g. "Projects / Work"), or null for a root-level page. */
  readonly breadcrumb: string | null;
}

export interface WikiLinkCreateSuggestion {
  readonly kind: 'create';
  /** The literal path as typed — becomes both the inserted WikiLink target and the created page's path. */
  readonly path: string;
  readonly create: () => void;
}

export type WikiLinkSuggestion = WikiLinkPageSuggestion | WikiLinkCreateSuggestion;

/** `query` is the raw text typed after `[[`, never including the brackets themselves. */
export type GetWikiLinkSuggestions = (query: string) => readonly WikiLinkSuggestion[];
