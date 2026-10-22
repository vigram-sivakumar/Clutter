import { WidgetType } from '@codemirror/view';
import type { TagResolution } from './tagResolution';

/**
 * The at-rest rendered form of a Tag. Renders `resolution.displayLabel`
 * (prefixed with `#`), not the raw matched text (`raw`) — for a tag with
 * no `-`/`_` separator these are identical, but for one that has a
 * separator, the injected resolution's `displayLabel` is what turns
 * "#Product_design" into "#Product design", using the vault-wide
 * preferred casing (`resolveTag.ts`), never this one occurrence's own
 * spelling. `raw` is still kept (constructor param, used by `eq()`) since
 * it's what identifies *which* syntax range this widget represents,
 * independent of how it's currently displayed. Still a real `WidgetType`
 * — not a no-decoration/`null` skip — specifically so this participates in
 * the existing `semanticTokenDecorations`/`EditorView.atomicRanges`
 * coupling (`semanticToken/tokenDecorations.ts`) the same way every other
 * at-rest semantic token does: atomicity there is derived entirely from
 * whether a widget decoration exists, so a `null` render would silently
 * lose whole-token atomic deletion, not just the visual replacement.
 *
 * A tag the host resolves with an `icon` shows that emoji instead of the `#` (`tok-tag-prefix--emoji`).
 *
 * `tok-tag` is the class hook for styling; `status` is additionally
 * exposed as its own `data-` attribute, mirroring `WikiLinkWidget`'s
 * `data-wikilink-status` pattern.
 *
 * `extraClasses` (inline-formatting composition — see
 * `collectActiveInlineClasses` in `inlineLivePreviewParticipants.ts` and
 * docs/editor-architecture-decisions.md's "Inline formatting composition
 * at the token level"): the content class of every enclosing delimited-mark
 * construct (e.g. `tok-strike` for `~~#tag~~`), applied directly onto this
 * widget's own root element so its CSS (e.g. `.tok-strike`'s
 * `text-decoration-line`) is declared on, and painted by, this element
 * itself — never relied upon to propagate in from an ancestor `<span>`.
 */
export class TagWidget extends WidgetType {
  constructor(
    readonly raw: string,
    readonly resolution: TagResolution,
    readonly extraClasses: readonly string[] = []
  ) {
    super();
  }

  override eq(other: TagWidget): boolean {
    return (
      this.raw === other.raw &&
      this.resolution.status === other.resolution.status &&
      this.resolution.displayLabel === other.resolution.displayLabel &&
      this.resolution.icon === other.resolution.icon &&
      this.extraClasses.length === other.extraClasses.length &&
      this.extraClasses.every((cls, i) => cls === other.extraClasses[i])
    );
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.classList.add('tok-tag', ...this.extraClasses);
    // A tag's activation filters/opens a tag-scoped view, closer to a
    // toggle/filter control than a hyperlink — "button", not "link"
    // (docs/editor-research/clutter-editor-shared-token-interaction-contract.md's
    // explicit recommendation for this construct's accessibility role).

    span.setAttribute('role', 'button');
    span.setAttribute(
      'aria-label',
      `${this.resolution.status} tag: #${this.resolution.displayLabel}`
    );
    span.dataset.tagStatus = this.resolution.status;

    // The prefix is the `#`, or — for a tag with an assigned emoji the host chose to show — that emoji in its place (plain
    // text, not an icon, and not dimmed). The aria-label above is unchanged: the emoji is decoration.
    const prefix = document.createElement('span');
    prefix.classList.add('tok-tag-prefix');
    if (this.resolution.icon) {
      prefix.classList.add('tok-tag-prefix--emoji');
      prefix.textContent = this.resolution.icon;
    } else {
      prefix.textContent = '#';
    }
    span.append(prefix, document.createTextNode(this.resolution.displayLabel));

    return span;
  }

  /**
   * Same fix `WikiLinkWidget.ignoreEvent` documents on itself: a
   * `WidgetType`'s default is to ignore every event, which would silently
   * discard `mousedown` before `tokenMouseHandlers.ts`'s
   * `EditorView.domEventHandlers` listener ever saw it. Only `mousedown`
   * needs to pass through — that's the only event type any Tag
   * interaction mechanism listens for.
   */
  override ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown';
  }
}
