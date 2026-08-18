import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Baseline visual wiring between CM6 and Clutter's own design-token
 * system (`design-system/theme.css`), not editor behavior — kept
 * separate from `createEditorView.ts`'s plain-text foundation comment
 * ("no ... decorations, or semantic-token behavior") since this is
 * theming, not a feature layer.
 *
 * CM6's own base theme sets the caret color as `caret-color` on
 * `.cm-content` (`&light .cm-content { caretColor: black }` / `&dark
 * .cm-content { caretColor: white }`) — not a `.cm-cursor` element,
 * which exists only when `drawSelection()` is enabled (it isn't, here).
 * Without `drawSelection()`, the visible caret is the browser's native
 * one, rendered because `.cm-content` is a real `contenteditable`
 * element; its color is controlled by CSS `caret-color`, styled here.
 *
 * CM6's own `&light`/`&dark` selectors track `EditorView.theme()`'s own
 * `dark` option, never set anywhere in this codebase — a separate
 * concept from Clutter's `[data-theme]` attribute, so CM6 always
 * resolves to its `&light` default regardless of Clutter's active
 * theme. `--editor-caret-color` (design-system/theme.css) is what
 * actually tracks `[data-theme='dark']`/`[data-theme='light']` here.
 *
 * `.cm-activeLine`'s default background (`highlightActiveLine()`'s own
 * baseTheme rule, `#cceeff44`) is neutralized here rather than in
 * `MarkdownEditor.css` — verified, not assumed: a plain external
 * stylesheet rule targeting `.cm-activeLine` does not reliably win this
 * override, because CM6 injects `baseTheme()`'s `<style>` into the
 * document dynamically at `EditorView` construction time, necessarily
 * after any statically-bundled CSS has already been inserted — with
 * matching specificity, later source order wins, so `baseTheme()` wins
 * regardless of what a static CSS file says. `EditorView.theme()` style
 * modules are what CM6 itself designs to take priority over
 * `baseTheme()` (the same reason the caret-color override above
 * actually works) — confirmed by testing both approaches directly
 * against the real injected stylesheets, not assumed from documentation.
 * `highlightActiveLine()` itself (`createEditorView.ts`) is kept only
 * for the `cm-activeLine` class it applies; this file removes the one
 * piece of its default appearance nothing here wants.
 */
export function editorTheme(): Extension {
  return EditorView.theme({
    '.cm-content': {
      caretColor: 'var(--editor-caret-color)',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
  });
}
