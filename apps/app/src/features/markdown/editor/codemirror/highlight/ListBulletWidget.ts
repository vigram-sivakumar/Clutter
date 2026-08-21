import { WidgetType } from '@codemirror/view';

/**
 * The at-rest rendered form of a bullet list's `ListMark` (`-`/`*`/`+`) —
 * a plain, non-interactive glyph, not a semantic token: no click/keyboard
 * activation, no `atomicRanges` registration, same as every other
 * `liveMarkDecoration`-collapsed marker. `cm-list-marker` is a dedicated
 * class, deliberately separate from `tok-mark` (which styles the *raw*
 * Markdown marker text when revealed by engagement — a different DOM
 * node entirely, at a different moment) so the resting bullet's own look
 * can be styled independently of it, per product ask.
 *
 * Ordered-list markers (`1.`) are unaffected — `listMarkerDecoration.ts`
 * only ever constructs this widget for a bullet marker's own range.
 */
export class ListBulletWidget extends WidgetType {
  override eq(_other: ListBulletWidget): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-list-marker';
    span.textContent = '•';
    return span;
  }
}
