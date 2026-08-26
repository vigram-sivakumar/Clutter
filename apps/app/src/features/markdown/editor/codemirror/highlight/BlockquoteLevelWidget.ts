import { WidgetType } from '@codemirror/view';

/**
 * The at-rest visual "rail" for one blockquote nesting level — purely
 * presentational, never renders `>` or any other document text. Owning
 * the actual `>` character (revealing/concealing it) stays entirely
 * `blockquoteMarkerDecoration.ts`'s job, unchanged; this widget never
 * duplicates, replaces, or reads that state. See
 * `blockquoteLevelDecoration.ts`'s doc comment for why a real DOM element
 * per level — rather than one shared painted background — was chosen, and
 * for how this widget is positioned so it still visually corresponds to
 * its own level's `>` without containing it.
 *
 * `--quote-level` (not just the `cm-quote-level-N` class) is set inline so
 * `MarkdownEditor.css` can position the rail via `calc()` without a
 * hardcoded per-depth class ladder — same pattern `blockquoteLineDecoration.ts`
 * already uses for `--quote-depth`.
 */
export class BlockquoteLevelWidget extends WidgetType {
  constructor(readonly level: number) {
    super();
  }

  override eq(other: BlockquoteLevelWidget): boolean {
    return this.level === other.level;
  }

  override toDOM(): HTMLElement {
    const rail = document.createElement('span');
    rail.className = `cm-quote-level cm-quote-level-${this.level}`;
    rail.setAttribute('aria-hidden', 'true');
    rail.style.setProperty('--quote-level', String(this.level));
    return rail;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}
