import { WidgetType } from '@codemirror/view';

import { PAGE_IDENTITY_ICON_BY_KIND } from '../mediaPresentation/pageIdentityIcons';

import type { WikiLinkResolution } from './wikiLinkResolution';

/**
 * The at-rest rendered form of a WikiLink. `tok-wikilink` is the class hook
 * for styling it; `status` is additionally exposed as its own `data-`
 * attribute, so a resolved/unresolved/ambiguous reference stays
 * structurally identical and can still be styled per-status (e.g.
 * `.tok-wikilink[data-wikilink-status="unresolved"]`) without a separate
 * class per status.
 *
 * Click/Alt-click/keyboard activation are wired elsewhere —
 * `EditorView.domEventHandlers` (`wikiLinkMouseHandlers.ts`) and a keymap
 * (`wikiLinkKeymap.ts`). This widget's only responsibility toward that
 * mechanism is `ignoreEvent()` below, which must let `mousedown` through
 * (see its own comment for why that's not just an implementation detail).
 *
 * `extraClasses` — inline-formatting composition (see
 * `collectActiveInlineClasses` in `inlineLivePreviewParticipants.ts` and
 * docs/editor-architecture-decisions.md's "Inline formatting composition
 * at the token level"): the content class of every enclosing delimited-mark
 * construct (`~~[[Page]]~~` → `tok-strike`, arbitrary depth/order), applied
 * directly onto this widget's own root element. This is what lets
 * `.tok-strike`'s plain, non-descendant `text-decoration-line` rule apply
 * to a WikiLink correctly with no CSS ancestor selector needed or used —
 * `.tok-wikilink` is an ordinary, fragmentable inline element (not an
 * atomic box; see `MarkdownEditor.css`'s `.tok-wikilink` rule), so this
 * self-composed class is the *only* source of a struck WikiLink's
 * strikethrough: `Strikethrough`'s own renderer
 * (`STRIKETHROUGH_PROTECTED_NODE_NAMES` in `inlineLivePreviewParticipants.ts`)
 * excludes `WikiLink` from its own ancestor `.tok-strike` span for exactly
 * this reason — otherwise the ancestor's propagated line-through and this
 * self-composed one would be two overlapping decorating boxes painting the
 * same line, which WKWebView doesn't reliably composite (the same bug
 * fixed for Markdown links; see that file's own doc comments).
 */
export class WikiLinkWidget extends WidgetType {
  constructor(
    readonly path: string,
    readonly alias: string | null,
    readonly resolution: WikiLinkResolution,
    readonly extraClasses: readonly string[] = []
  ) {
    super();
  }

  override eq(other: WikiLinkWidget): boolean {
    return (
      this.path === other.path &&
      this.alias === other.alias &&
      this.resolution.status === other.resolution.status &&
      this.resolution.displayLabel === other.resolution.displayLabel &&
      (this.resolution.status !== 'resolved' ||
        other.resolution.status !== 'resolved' ||
        (this.resolution.icon === other.resolution.icon && this.resolution.emoji === other.resolution.emoji)) &&
      this.extraClasses.length === other.extraClasses.length &&
      this.extraClasses.every((cls, i) => cls === other.extraClasses[i])
    );
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.classList.add('tok-wikilink', ...this.extraClasses);
    // Baseline accessibility hook (§6) — not a final ARIA design. Whether
    // "link" is the right role for every status, and the exact wording of
    // the accessible name, is a deferred, deliberately unresolved question
    // (docs/editor-architecture-decisions.md, "hidden Markdown syntax
    // exposed to accessibility" is still open).
    span.setAttribute('role', 'link');
    span.setAttribute('aria-label', `${this.resolution.status}: ${this.resolution.displayLabel}`);
    span.dataset.wikilinkStatus = this.resolution.status;

    // A resolved WikiLink's at-rest presentation mirrors a Note embed's
    // own header exactly — its target's assigned emoji if it has one,
    // else its type's own canonical default icon — via the same shared
    // `resolution.icon`/`resolution.emoji` pair `NoteEmbedWidget.ts`
    // consumes (both computed by the one shared `resolvePageIdentityIcon()`
    // — see that module's own doc comment). Purely a rendering concern:
    // never reflected into the Markdown (still just `[[Note]]`), and never
    // shown once the raw syntax is revealed — this whole widget is
    // replaced by plain text on engage (`wikiLinkLivePreview.ts`), so no
    // separate "hide the icon while engaged" logic is needed here.
    // `unresolved`/`ambiguous` reference no real page to have one, so they
    // keep the previous flat-text rendering unchanged.
    if (this.resolution.status === 'resolved') {
      const iconWrap = document.createElement('span');
      iconWrap.classList.add('tok-wikilink__icon-wrap');
      if (this.resolution.emoji) {
        const emojiSpan = document.createElement('span');
        emojiSpan.classList.add('tok-wikilink__emoji');
        emojiSpan.textContent = this.resolution.emoji;
        iconWrap.append(emojiSpan);
      } else {
        iconWrap.innerHTML = PAGE_IDENTITY_ICON_BY_KIND[this.resolution.icon];
        iconWrap.querySelector('svg')?.classList.add('tok-wikilink__icon');
      }

      const titleSpan = document.createElement('span');
      titleSpan.classList.add('tok-wikilink__title');
      titleSpan.textContent = this.resolution.displayLabel;

      span.append(iconWrap, titleSpan);
    } else {
      span.textContent = this.resolution.displayLabel;
    }

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
