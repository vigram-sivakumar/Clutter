import { WidgetType } from '@codemirror/view';

/**
 * The at-rest rendered form of a bullet-list marker (`-`, `*`, `+`, plus
 * its own trailing separator space) — a `Decoration.replace({widget})`
 * standing in for the collapsed raw text, exactly the mechanism
 * `liveMarkDecoration.ts`'s own doc comment already names this file as
 * ("a resting bullet glyph standing in for a hidden `-`/`*`/`+`").
 *
 * Unlike `ConcealedMarkerWidget` (which renders nothing — headings,
 * emphasis, etc. simply hide their markers), this widget renders real,
 * visible content: a bullet dot. A list marker isn't punctuation to hide,
 * it's the thing that makes the line read as a list item at all — an
 * empty box here would leave every item with no visible marker.
 *
 * All instances are equivalent (no per-marker state — every bullet, of any
 * of the three source characters, renders identically), so `eq` always
 * returns `true`.
 */
export class ListBulletWidget extends WidgetType {
  override eq(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-list-marker cm-bullet-list-marker';
    span.textContent = '•';
    return span;
  }

  /**
   * Same reasoning as `ConcealedMarkerWidget.ignoreEvent`: this widget has
   * no click behavior of its own, so letting `mousedown` through to CM6's
   * built-in click-to-position handling (rather than the `WidgetType`
   * default of swallowing it) means a click on the bullet places the caret
   * there and engages the list item, exactly like clicking anywhere else
   * in ordinary text.
   */
  override ignoreEvent(): boolean {
    return false;
  }
}
