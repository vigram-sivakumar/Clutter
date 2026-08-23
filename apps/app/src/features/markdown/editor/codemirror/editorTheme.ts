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
 *
 * `.cm-selectionBackground` (`drawSelection()`, `createEditorView.ts`)
 * gets the same override treatment as `.cm-activeLine` above, for the
 * same documented reason: its default color is a `baseTheme()`
 * `&light`/`&dark`/focused-state style module a static CSS rule can't
 * reliably beat. One unqualified selector — no `&light`/`&dark` of our
 * own — so Clutter's own `[data-theme]`-driven `--selection-surface`
 * token (`design-system/theme.css`) is the only thing controlling the
 * color in either theme, not CM6's. `drawSelection()` also suppresses
 * native `::selection` entirely (see the caret-color note above), so
 * this is the only place selection color can be set for this editor.
 *
 * A second, more specific rule is required for the *focused* state, and
 * it must start with a bare `&` — not a specificity concern, a selector-
 * compilation one. `EditorView.theme()`'s selector compiler
 * (`buildTheme`'s `finish()`, `@codemirror/view`) only compounds its
 * auto-generated scope class onto a selector's first compound when that
 * selector starts with `&`; otherwise it just prepends the scope class
 * with a *space* (a separate-ancestor descendant combinator, not a
 * compound). A selector written as plain
 * `'.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground'`
 * therefore compiles to `.ͼX .cm-focused > ...` — requiring the scope
 * class to be an ancestor of an element carrying `.cm-focused`, which
 * can never match, since both classes actually live on the same
 * `.cm-editor` element. Confirmed directly, not inferred: `element.matches()`
 * against the real `.cm-selectionBackground` node in a running editor
 * returned `false` for that selector shape, and `true` once rewritten
 * with a leading `&` (`&.cm-focused > ...`, compiling to the correct
 * compound `.ͼX.cm-focused > ...`, mirroring `drawSelection()`'s own
 * `&light.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground`
 * shape). `&` here is CM6's generic "this rule's scope" token, not
 * `&light`/`&dark` — it does no theme branching of its own.
 */
export function editorTheme(): Extension {
  return EditorView.theme({
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-selectionBackground': {
      background: 'var(--selection-surface)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      background: 'var(--selection-surface)',
    },
  });
}
