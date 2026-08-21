import { WidgetType } from '@codemirror/view';

/**
 * The at-rest rendered form of a bullet list's `ListMark` (`-`/`*`/`+`) —
 * a plain, non-interactive glyph, not a semantic token: no click/keyboard
 * activation, no `atomicRanges` registration, same as every other
 * `liveMarkDecoration`-collapsed marker. `cm-bullet-list-marker` is a
 * dedicated class, deliberately separate from `tok-mark` (which styles the
 * *raw* Markdown marker text when revealed by engagement — a different DOM
 * node entirely, at a different moment) so the resting bullet's own look
 * can be styled independently of it, per product ask.
 *
 * Also carries `cm-list-marker` — the shared class every list-item marker
 * kind carries (bullet/ordered/task/emoji alike), the common CSS hook for
 * anything that visually represents "this line's marker," regardless of
 * kind. `cm-bullet-list-marker` remains the bullet-specific hook alongside
 * it, so bullet-only styling stays independent of the shared one.
 *
 * Ordered-list markers (`1.`) get the same at-rest treatment via their own
 * `OrderedListMarkerWidget`/`.cm-list-number` — `listMarkerDecoration.ts`
 * only ever constructs *this* widget for a bullet marker's own range, so
 * the two glyphs stay styleable independently.
 */
export class ListBulletWidget extends WidgetType {
  override eq(_other: ListBulletWidget): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-list-marker cm-bullet-list-marker';
    span.textContent = '•';
    return span;
  }
}
