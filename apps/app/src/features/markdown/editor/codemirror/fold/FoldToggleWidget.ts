import { foldEffect, unfoldEffect } from '@codemirror/language';
import { WidgetType, type EditorView } from '@codemirror/view';

const CHEVRON_RIGHT_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3.5L11 8L6 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_DOWN_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 6L8 11L12.5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * The Clutter-authored replacement for `@codemirror/language`'s own
 * `foldGutter()` UI (removed from `createEditorView.ts` — see that file's
 * own doc comment). Same division of labor `foldGutter()` itself always
 * had: this widget only ever dispatches the native `foldEffect`/
 * `unfoldEffect` — `codeFolding()`'s `foldState` field, `foldable()`'s own
 * node-prop/`foldService` resolution, and `foldKeymap`'s keyboard bindings
 * are all completely unmodified, unowned by this file. This is UI/
 * decoration placement only, never a reimplementation of fold mechanics.
 *
 * Placed inline at the owning line's own start (`FoldToggleDecoration.ts`'s
 * `Decoration.widget({..., side: -1}).range(line.from)`) rather than in a
 * `gutter()` column — CM6 inserts this widget's DOM as an ordinary child of
 * the real `.cm-line` it belongs to, the same relationship every other
 * inline widget in this codebase already has to its own line (e.g.
 * `fencedCodeCopyButtonDecoration.ts`'s button); this file never adds a
 * class or style to `.cm-line` itself, per the project's permanent CSS rule.
 *
 * `folded` (not the fold range itself) is the only field `eq()` compares —
 * this widget's own anchor position is what the containing `RangeSet`
 * already keys equality/reuse decisions on, so a rebuild that finds the
 * same owning line still folded (or still foldable-but-unfolded) reuses the
 * existing DOM node untouched, matching every other widget's own freshness
 * convention in this codebase (`NoteEmbedWidget.eq()`,
 * `FencedCodeCopyButtonWidget.eq()`).
 *
 * The click handler never captures a fold range at construction time —
 * it re-resolves the owning line's current fold/foldable state fresh, at
 * click time, from `linePos` alone (via the caller-supplied `resolve`
 * closure) — the same "read live state at activation time, never from a
 * stale closure" discipline `FencedCodeCopyButtonWidget.getCode` and
 * `NoteEmbedWidget`'s Expand/Edit-source buttons already establish, so an
 * edit between this widget's construction and the user's click can never
 * make it dispatch a fold/unfold effect against a range that no longer
 * matches the document.
 */
export class FoldToggleWidget extends WidgetType {
  constructor(
    private readonly linePos: number,
    private readonly folded: boolean,
    private readonly resolve: (view: EditorView, linePos: number) => { from: number; to: number } | null
  ) {
    super();
  }

  override eq(other: FoldToggleWidget): boolean {
    return this.folded === other.folded;
  }

  override toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-fold-toggle';
    button.dataset.folded = String(this.folded);
    button.setAttribute('aria-label', this.folded ? 'Expand' : 'Collapse');
    button.title = this.folded ? 'Expand' : 'Collapse';
    button.innerHTML = this.folded ? CHEVRON_RIGHT_ICON : CHEVRON_DOWN_ICON;

    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const range = this.resolve(view, this.linePos);
      if (!range) {
        return;
      }
      view.dispatch({ effects: (this.folded ? unfoldEffect : foldEffect).of(range) });
    });

    return button;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
