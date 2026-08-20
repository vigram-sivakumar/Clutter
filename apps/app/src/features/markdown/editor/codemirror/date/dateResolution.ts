/**
 * The injected Date resolution contract — concrete and Date-specific, not
 * a generic semantic-token descriptor (same deliberate non-generalization
 * `wikiLinkResolution.ts`/`tagResolution.ts` document on themselves).
 *
 * Narrower than either: there is no `displayLabel` here at all, and no
 * `status`. Unlike WikiLink/Tag, a Date's display label
 * (`formatDateDisplay`) and its validity (`isValidCalendarDate`) are both pure,
 * Vault-independent computations — `shared/helpers/time` needs no
 * injection, so `DateWidget` computes them directly rather than routing
 * them through this boundary for no reason. The *only* thing that
 * genuinely needs app-layer injection is `activate()`, since opening the
 * Daily Note needs `PageOperations`/`Vault.root` — classes the editor
 * never imports itself (docs/editor-architecture-decisions.md,
 * "Editor/persistence boundary").
 */
export interface DateResolution {
  readonly activate: () => void;
}

/** `isoDate` is the matched date text (shape-valid; may or may not be calendar-valid — see `isValidCalendarDate`). */
export type ResolveDate = (isoDate: string) => DateResolution;

/**
 * Used when no resolver is injected, or defensively if one is but the
 * caller still needs a value — there is nothing meaningful to activate.
 */
export function fallbackDateResolution(): DateResolution {
  return { activate: () => {} };
}
