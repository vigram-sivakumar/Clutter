/**
 * The injected WikiLink resolution contract — concrete and WikiLink-
 * specific, not a generic semantic-token descriptor. That generalization
 * is deferred to the §11 stop-gate review, once a real second kind exists
 * to prove or correct the shape against.
 *
 * `resolve`, `displayLabel`, and `activate` are bundled into one injected
 * call rather than three the editor composes itself. This is a pragmatic
 * simplification for this one concrete kind: the alias-fallback precedence
 * chain (local alias > target's primary frontmatter alias > filename, per
 * docs/editor-architecture-decisions.md) is computed entirely on the
 * app-layer side of this boundary, where `Vault`/`EffectivePageState`
 * access actually lives — the editor never sees a path resolve to
 * anything beyond this one result object, and never computes a display
 * label or a click behavior itself.
 */
export type WikiLinkResolution =
  | { readonly status: 'resolved'; readonly displayLabel: string; readonly activate: () => void }
  | { readonly status: 'unresolved'; readonly displayLabel: string; readonly activate: () => void }
  | { readonly status: 'ambiguous'; readonly displayLabel: string; readonly activate: () => void };

/**
 * Injected by the feature/app layer — the editor never imports `Vault`,
 * `VaultQuery`, `EffectivePageState`, or `PageOperations` itself
 * (docs/editor-architecture-decisions.md, "Editor/persistence boundary").
 * `localAlias` is `null` when the reference has no `|alias` segment; the
 * resolver, not the editor, decides what to display in that case.
 */
export type ResolveWikiLink = (path: string, localAlias: string | null) => WikiLinkResolution;

/**
 * Used when no resolver is injected, or defensively if one is but the
 * caller still needs a value — the raw path is the only sensible fallback
 * label, and there is nothing meaningful to activate. Shared by every
 * WikiLink-specific consumer of the generic semantic-token mechanisms
 * (decorations, mouse handlers, keymap) so this fallback exists in exactly
 * one place.
 */
export function fallbackWikiLinkResolution(path: string): WikiLinkResolution {
  return { status: 'unresolved', displayLabel: path, activate: () => {} };
}
