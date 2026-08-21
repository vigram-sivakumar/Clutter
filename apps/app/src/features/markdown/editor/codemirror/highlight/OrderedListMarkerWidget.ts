import { WidgetType } from '@codemirror/view';

/**
 * The at-rest rendered form of an ordered list's `ListMark` (`1.`, `2)`,
 * …) — the numbered-list counterpart to `ListBulletWidget`, kept as its
 * own class (not a variant of it) specifically so `.cm-list-number` can be
 * styled independently of `.cm-bullet-list-marker` in CSS, per product ask.
 *
 * Also carries `cm-list-marker` — the shared class every list-item marker
 * kind carries (bullet/ordered/task/emoji alike); see `ListBulletWidget`'s
 * doc comment for the full rationale.
 *
 * Renders the actual parsed marker text (`raw`), never an assumed "1." —
 * `listMarkerDecoration.ts` passes each `ListMark` node's own sliced
 * source text, so the second/third/… item's real number (and its own
 * delimiter, `.` or `)`) always shows correctly, including inside nested
 * ordered lists that restart their own numbering. `eq` compares `raw` so a
 * later re-render with a different number (e.g. after an item is
 * inserted/removed above it) is treated as a distinct widget rather than
 * reused stale DOM.
 */
export class OrderedListMarkerWidget extends WidgetType {
  constructor(private readonly raw: string) {
    super();
  }

  override eq(other: OrderedListMarkerWidget): boolean {
    return other.raw === this.raw;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-list-marker cm-list-number';
    span.textContent = this.raw;
    return span;
  }
}
