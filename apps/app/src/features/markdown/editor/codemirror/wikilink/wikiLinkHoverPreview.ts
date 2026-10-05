import type { Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';

/**
 * A hovered WikiLink: its rendered element (the preview's anchor) plus what
 * the host needs to preview it. A *resolved* link carries its target page's
 * id (`WikiLinkWidget.toDOM`'s `data-wikilink-page-id`) — opaque to the
 * editor, which never learns what a page is (`boundary.test.ts`). An
 * *unresolved* link has no page, so it carries the title it would have
 * (`data-wikilink-title`: its local alias, else the target's filename).
 * Ambiguous links carry neither and are not hoverable here.
 */
export type WikiLinkHoverTarget =
  | { readonly kind: 'resolved'; readonly element: HTMLElement; readonly pageId: string }
  | { readonly kind: 'unresolved'; readonly element: HTMLElement; readonly title: string };

/**
 * What the editor reports. It owns no timing: `enter` fires the moment the
 * pointer lands on a link, `leave` the moment it leaves (or the editor
 * invalidates the hover); the open delay lives in
 * `useWikiLinkPreviewHover`, since the pointer's trip from the link onto the
 * preview is a fact only the host (which owns the preview) can see.
 */
export interface WikiLinkHoverHandlers {
  readonly enter: (target: WikiLinkHoverTarget) => void;
  readonly leave: () => void;
}

function wikiLinkAt(target: EventTarget | null): HTMLElement | null {
  const link = target instanceof Element ? target.closest<HTMLElement>('.tok-wikilink') : null;
  return link && (link.dataset.wikilinkPageId || link.dataset.wikilinkTitle !== undefined) ? link : null;
}

function toHoverTarget(link: HTMLElement): WikiLinkHoverTarget {
  return link.dataset.wikilinkPageId
    ? { kind: 'resolved', element: link, pageId: link.dataset.wikilinkPageId }
    : { kind: 'unresolved', element: link, title: link.dataset.wikilinkTitle ?? '' };
}

/**
 * Hover reporting for WikiLinks — one delegated `mouseover`/`mouseout` pair
 * on the editor's root, however many links the document has.
 *
 * Native listeners, deliberately not `EditorView.domEventHandlers`: CM6
 * routes an event that bubbles up from a widget through that widget's
 * `ignoreEvent()` first, and `WikiLinkWidget` ignores everything except
 * `mousedown` (see its doc comment). Widening that to let hover through would
 * change how the widget participates in click/selection handling, which this
 * feature must not touch. The listeners are passive observers: they never
 * call `preventDefault`, move the selection, dispatch, or focus anything.
 *
 * Nothing is reported while a mouse button is down (a drag-selection passing
 * over a link), and the hover is dropped on `mousedown` (a click navigates;
 * a press may start a selection), on any document or selection change, and on
 * destroy — so the preview can't outlive the link it was anchored to.
 */
export function wikiLinkHoverPreview(getHandlers: () => WikiLinkHoverHandlers | undefined): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly onOver = (event: MouseEvent) => {
        if (event.buttons !== 0) {
          return;
        }
        const link = wikiLinkAt(event.target);
        if (!link || (event.relatedTarget instanceof Node && link.contains(event.relatedTarget))) {
          return;
        }
        getHandlers()?.enter(toHoverTarget(link));
      };

      private readonly onOut = (event: MouseEvent) => {
        const link = wikiLinkAt(event.target);
        if (!link || (event.relatedTarget instanceof Node && link.contains(event.relatedTarget))) {
          return;
        }
        getHandlers()?.leave();
      };

      private readonly onDown = () => getHandlers()?.leave();

      constructor(private readonly view: EditorView) {
        view.dom.addEventListener('mouseover', this.onOver);
        view.dom.addEventListener('mouseout', this.onOut);
        view.dom.addEventListener('mousedown', this.onDown);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          getHandlers()?.leave();
        }
      }

      destroy() {
        this.view.dom.removeEventListener('mouseover', this.onOver);
        this.view.dom.removeEventListener('mouseout', this.onOut);
        this.view.dom.removeEventListener('mousedown', this.onDown);
        getHandlers()?.leave();
      }
    }
  );
}
