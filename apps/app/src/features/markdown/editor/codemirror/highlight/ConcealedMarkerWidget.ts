import { WidgetType } from '@codemirror/view';

/**
 * The at-rest (concealed) rendered form of an inline formatting marker
 * (`**`, `*`, `~~`, `==`, `` ` ``) — replaces `Decoration.mark` +
 * near-zero-`font-size`/`transform` CSS hacking (docs/editor-architecture-
 * decisions.md's `Decoration.replace()`-with-widget entry has the full
 * investigation and the two rejected predecessors).
 *
 * The DOM element carries **no text** — unlike the retired mark-based
 * technique, which kept the marker's real glyphs in the DOM and fought the
 * browser's text layout to make them invisible, this decoration replaces
 * the marker's source range outright (per `Decoration.replace()`'s own
 * documented purpose: "replaces the given range with a widget, or simply
 * hides it"). An empty, independently-styled box owes nothing to the
 * marker's own font metrics, so `width: 0` and a normal, non-degenerate
 * `height` are two ordinary, uncontested CSS declarations rather than
 * competing demands on the same shrunk text run — see `.cm-marker--concealed`
 * in `MarkdownEditor.css` for the exact rule and the measurements that
 * justify it.
 *
 * `markerClass` (`cm-emphasis-marker`/`cm-strong-marker`/`cm-strike-marker`/
 * `cm-highlight-marker`/`cm-code-marker`) is carried purely for continuity
 * with the per-construct concealed-marker queries the existing test suite
 * already relies on (`markerBoundaryBehavior.test.ts`'s "mixed constructs"
 * case) — it has no visual effect while concealed (the box is invisible
 * either way) and is not read by any styling rule.
 */
export class ConcealedMarkerWidget extends WidgetType {
  constructor(readonly markerClass: string) {
    super();
  }

  override eq(other: ConcealedMarkerWidget): boolean {
    return this.markerClass === other.markerClass;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `cm-marker ${this.markerClass} cm-marker--concealed`;
    return span;
  }

  /**
   * Same fix `WikiLinkWidget.ignoreEvent`/`TagWidget.ignoreEvent` document
   * on themselves, for the opposite reason: `WidgetType`'s default is to
   * ignore every event, which is `eventBelongsToEditor`'s actual gate for
   * whether an event reaches CM6's own dispatch **at all** — including
   * CM6's own built-in click-to-position handling, not just extension-
   * registered `domEventHandlers`. Those two widgets let `mousedown`
   * through so *their own* click extensions see it; this widget has no
   * click extension of its own — it needs `mousedown` to reach CM6's
   * *built-in* handling instead, so a click on/near a concealed marker
   * places the caret there and engages the construct, exactly as clicking
   * anywhere else in ordinary text would. Verified directly (not assumed):
   * a real click at this widget's own on-screen coordinate, with
   * `ignoreEvent` returning `false`, resolved to the correct document
   * position and engaged the construct; the CM6 default (`true`) would
   * have silently discarded the click instead. No other event type needs
   * to pass through — this widget has no interaction of its own beyond
   * being part of ordinary editable text.
   */
  override ignoreEvent(): boolean {
    return false;
  }
}
