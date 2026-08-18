import { WidgetType } from '@codemirror/view';

import type { WikiLinkResolution } from './wikiLinkResolution';

/**
 * The at-rest rendered form of a WikiLink. No visual styling here — colors,
 * borders, pill/chip treatment are explicitly deferred. `status` is
 * exposed as a single `data-` attribute, the only style hook, so a
 * resolved/unresolved/ambiguous reference stays structurally identical
 * and only differs by that one hook once visual design happens.
 *
 * Click/Alt-click/keyboard activation are wired elsewhere —
 * `EditorView.domEventHandlers` (`wikiLinkMouseHandlers.ts`) and a keymap
 * (`wikiLinkKeymap.ts`). This widget's only responsibility toward that
 * mechanism is `ignoreEvent()` below, which must let `mousedown` through
 * (see its own comment for why that's not just an implementation detail).
 */
export class WikiLinkWidget extends WidgetType {
  constructor(
    readonly path: string,
    readonly alias: string | null,
    readonly resolution: WikiLinkResolution
  ) {
    super();
  }

  override eq(other: WikiLinkWidget): boolean {
    return (
      this.path === other.path &&
      this.alias === other.alias &&
      this.resolution.status === other.resolution.status &&
      this.resolution.displayLabel === other.resolution.displayLabel
    );
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.textContent = this.resolution.displayLabel;
    // Baseline accessibility hook (§6) — not a final ARIA design. Whether
    // "link" is the right role for every status, and the exact wording of
    // the accessible name, is a deferred, deliberately unresolved question
    // (docs/editor-architecture-decisions.md, "hidden Markdown syntax
    // exposed to accessibility" is still open).
    span.setAttribute('role', 'link');
    span.setAttribute('aria-label', `${this.resolution.status}: ${this.resolution.displayLabel}`);
    span.dataset.wikilinkStatus = this.resolution.status;
    return span;
  }

  /**
   * Corrected from an earlier, incorrect assumption (documented on the
   * class above as it stood before this fix): `ignoreEvent()` is not
   * merely about CM6's own default click-to-position handling — it is
   * `eventBelongsToEditor`'s (view internals) actual gate for whether an
   * event bubbling up from this widget's DOM reaches the editor's own
   * `handleEvent` dispatch AT ALL, including every extension registered
   * via `EditorView.domEventHandlers` (confirmed by reading
   * `@codemirror/view`'s source directly, not assumed from the type
   * signature — `WidgetType`'s own doc comment: "the default is to
   * ignore all events"). Returning `true` unconditionally, as this widget
   * previously did, silently discarded every `mousedown` a real click
   * produced before `wikiLinkMouseHandlers.ts`'s handler ever ran — a
   * gap invisible to `handleWikiLinkClick`'s existing unit tests, which
   * call that function directly and never go through CM6's real DOM
   * event pipeline at all.
   *
   * Only `mousedown` needs to pass through, since that's the only event
   * type any WikiLink interaction mechanism actually listens for
   * (`wikiLinkMouseHandlers.ts`); every other event type keeps CM6's
   * documented default (ignored), rather than opening this widget up to
   * default click-to-position/selection handling it was never designed
   * to receive.
   */
  override ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown';
  }
}
