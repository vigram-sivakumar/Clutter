import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Baseline visual wiring between CM6 and Clutter's own design-token
 * system (`design-system/theme.css`), not editor behavior — kept
 * separate from `createEditorView.ts`'s plain-text foundation comment
 * ("no ... decorations, or semantic-token behavior") since this is
 * theming, not a feature layer.
 *
 * No `.cm-content` `caret-color` rule here: `drawSelection()`
 * (`createEditorView.ts`) is the current rendering baseline, and it
 * bundles `hideNativeSelection` — a `Prec.highest` `EditorView.theme()`
 * forcing `.cm-content`/`.cm-line { caret-color: transparent !important }`
 * unconditionally. `Prec.highest` beats any other style module regardless
 * of source order (confirmed by reading `@codemirror/view`'s own
 * `drawSelection` source, not assumed), so a `caret-color` rule here could
 * never actually win — it would be dead styling, not a fallback. The
 * caret CM6 draws instead is `.cm-cursor`, styled in `MarkdownEditor.css`
 * (`.cm-editor.cm-focused .cm-cursor { border-left-color:
 * var(--foreground-primary) }`), which is where theme-token-driven caret
 * color actually lives now.
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
 * `baseTheme()` — confirmed by testing both approaches directly against
 * the real injected stylesheets, not assumed from documentation.
 * `highlightActiveLine()` itself (`createEditorView.ts`) is kept only
 * for the `cm-activeLine` class it applies; this file removes the one
 * piece of its default appearance nothing here wants.
 */
export function editorTheme(): Extension {
  return EditorView.theme({
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
  });
}
