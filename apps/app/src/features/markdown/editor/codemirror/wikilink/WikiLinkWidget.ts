import { WidgetType } from '@codemirror/view';

import type { WikiLinkResolution } from './wikiLinkResolution';

/**
 * The at-rest rendered form of a WikiLink. No visual styling here — colors,
 * borders, pill/chip treatment are explicitly deferred. `status` is
 * exposed as a single `data-` attribute, the only style hook, so a
 * resolved/unresolved/ambiguous reference stays structurally identical
 * and only differs by that one hook once visual design happens.
 *
 * Click/Alt-click/keyboard activation are deliberately not wired here —
 * `ignoreEvent()` only tells CM6 not to apply its own default
 * click-to-position handling to this widget's DOM (not meaningful for a
 * replaced/atomic range anyway); the actual interaction mechanisms are
 * `EditorView.domEventHandlers` and a keymap, built in §7.
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

  override ignoreEvent(): boolean {
    return true;
  }
}
