/**
 * The injected Tag autocomplete contract — mirrors
 * `wikiLinkSuggestion.ts`'s `GetWikiLinkSuggestions` shape and the same
 * boundary rule (docs/editor-architecture-decisions.md, "Editor/persistence
 * boundary"): the editor never imports `Vault` itself, it only calls a
 * function the app layer supplies.
 *
 * Deliberately simpler than `GetWikiLinkSuggestions` — a plain name, not a
 * `{ kind, ... }` union. There is no "create" suggestion kind the way
 * WikiLink has one: per `tagResolution.ts`'s own reasoning, a `#newtag`
 * needs no explicit creation step, it simply exists once the containing
 * page is saved and re-ingested. Suggestions here are only ever "existing
 * tags matching the query" — nothing to insert but the name itself.
 */
export type GetTagSuggestions = (query: string) => readonly string[];
