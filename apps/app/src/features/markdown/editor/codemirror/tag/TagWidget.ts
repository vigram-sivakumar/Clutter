import { WidgetType } from '@codemirror/view';

import type { TagResolution } from './tagResolution';

/**
 * The at-rest rendered form of a Tag. Unlike `WikiLinkWidget`, this renders
 * the exact raw matched text (`raw`, e.g. `"#project"`) verbatim, not a
 * separately-computed display label — a tag's raw and at-rest forms are
 * meant to look identical (docs/editor-research/clutter-editor-shared-
 * semantic-inline-model.md: "the reveal transform for this kind is closer
 * to a no-op"). Still a real `WidgetType` — not a no-decoration/`null`
 * skip — specifically so this participates in the existing
 * `semanticTokenDecorations`/`EditorView.atomicRanges` coupling
 * (`semanticToken/tokenDecorations.ts`) the same way every other at-rest
 * semantic token does: atomicity there is derived entirely from whether a
 * widget decoration exists, so a `null` render would silently lose
 * whole-token atomic deletion, not just the visual replacement.
 *
 * `tok-tag` is the class hook for styling; `status` is additionally
 * exposed as its own `data-` attribute, mirroring `WikiLinkWidget`'s
 * `data-wikilink-status` pattern.
 */
export class TagWidget extends WidgetType {
  constructor(
    readonly raw: string,
    readonly resolution: TagResolution
  ) {
    super();
  }

  override eq(other: TagWidget): boolean {
    return this.raw === other.raw && this.resolution.status === other.resolution.status;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.textContent = this.raw;
    span.classList.add('tok-tag');
    // A tag's activation filters/opens a tag-scoped view, closer to a
    // toggle/filter control than a hyperlink — "button", not "link"
    // (docs/editor-research/clutter-editor-shared-token-interaction-contract.md's
    // explicit recommendation for this construct's accessibility role).
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', `${this.resolution.status} tag: ${this.raw}`);
    span.dataset.tagStatus = this.resolution.status;
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
