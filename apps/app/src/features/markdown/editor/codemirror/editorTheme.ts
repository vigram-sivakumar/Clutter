import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Baseline visual wiring between CM6 and Clutter's own design-token
 * system (`design-system/theme.css`), not editor behavior — kept
 * separate from `createEditorView.ts`'s plain-text foundation comment
 * ("no ... decorations, or semantic-token behavior") since this is
 * theming, not a feature layer.
 *
 * CM6's own base theme hardcodes the caret color
 * (`.cm-cursor { border-left: 1.2px solid black }`, with a `&dark`
 * variant that only ever applies when `EditorView.theme(..., { dark:
 * true })` is set, which nothing here does) — so without this override,
 * the caret was always opaque black regardless of Clutter's active
 * theme, invisible against `--surface-primary` in dark mode.
 * `--foreground-primary` already tracks both `[data-theme='dark']` and
 * `[data-theme='light']` (design-system/theme.css), so referencing it
 * here (rather than a literal color) keeps the caret correct in both
 * without this file ever needing to know which theme is active.
 */
export function editorTheme(): Extension {
  return EditorView.theme({
    '.cm-cursor': {
      borderLeftColor: 'var(--foreground-primary)',
    },
  });
}
