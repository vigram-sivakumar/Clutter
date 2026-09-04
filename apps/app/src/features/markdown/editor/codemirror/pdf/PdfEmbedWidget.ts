import { EditorSelection } from '@codemirror/state';
import { WidgetType, type EditorView } from '@codemirror/view';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';

import '@features/pdf/pdfWorker';
// `.pdf-viewer__page`/`.pdf-viewer__page-canvas`/`.textLayer` are flat,
// un-namespaced class selectors (no `.pdf-viewer` ancestor requirement,
// confirmed by reading PdfViewer.css directly) — this widget reuses that
// exact DOM/CSS contract for its own single-page render rather than
// inventing a second one. Imported explicitly here, mirroring
// MarkdownEditor.tsx's own stated reason for explicitly importing
// ImageFloatingControls.css: this widget's styling must not depend on
// whichever other component happens to import PdfViewer.css first.
import '@features/pdf/PdfViewer.css';
import { renderPdfPage, type RenderPdfPageHandle } from '@features/pdf/pdfPageRenderer';
import { DEFAULT_ZOOM_INDEX, ZOOM_LEVELS_PERCENT, stepZoomIndex, zoomPercentAt } from '@features/pdf/pdfZoom';

import { computeImageDeletionRange } from '../image/imageDeletion';
import { setImageUiState, type ImageUiState } from '../image/imageUiState';

import './PdfEmbedWidget.css';

// Hand-copied inline SVGs, same raw-DOM-widget convention ImageWidget.ts
// already establishes (no React tree is available inside a CM6 WidgetType,
// so the app's real AppIcon component system can't mount here). PDF_ICON
// is the exact same markup embedCompletionRenderer.ts already inlines for
// a PDF suggestion row, reused verbatim for visual consistency between the
// autocomplete row and the rendered embed. EDIT_ICON/TRASH_ICON are the
// exact same paths ImageWidget.ts already hand-copies from
// shared/icon/svg/{pen... }/trash.svg; MINUS/PLUS/ARROW_LEFT/ARROW_RIGHT/
// LINK/BROKEN_IMAGE are hand-copied from their own shared/icon/svg sources.
const PDF_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 13.3571H3.11111C3.47947 13.3571 3.83274 13.2066 4.0932 12.9387C4.35367 12.6708 4.5 12.3075 4.5 11.9286C4.5 11.5497 4.35367 11.1863 4.0932 10.9184C3.83274 10.6505 3.47947 10.5 3.11111 10.5H2V14.5" stroke="currentColor" stroke-linecap="round"/><path d="M6.75 10.5V14.5H7.65909C8.08103 14.5 8.48568 14.2893 8.78403 13.9142C9.08239 13.5391 9.25 13.0304 9.25 12.5C9.25 11.9696 9.08239 11.4609 8.78403 11.0858C8.48568 10.7107 8.08103 10.5 7.65909 10.5H6.75Z" stroke="currentColor" stroke-linecap="round"/><path d="M11.5 14.5V12.4429M11.5 12.4429V10.5H14M11.5 12.4429H13.5238" stroke="currentColor" stroke-linecap="round"/><path d="M14 8.5V7V6M2 8.5V4C2 2.34315 3.34315 1 5 1H6H8H9M9 1V3C9 4.65685 10.3431 6 12 6H14M9 1C9.64029 1 10.2544 1.25435 10.7071 1.70711L13.2929 4.29289C13.7456 4.74565 14 5.35971 14 6" stroke="currentColor" stroke-linecap="round"/></svg>';

const EDIT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.625 4L3.64738 9.30947C3.22603 9.7589 2.95326 10.3272 2.86614 10.937L2.64142 12.5101C2.57071 13.005 2.99497 13.4293 3.48995 13.3586L4.95655 13.1491C5.63195 13.0526 6.25428 12.7288 6.7209 12.231L11.625 7M8.625 4L9.79364 2.75345C10.18 2.34132 10.831 2.33098 11.2304 2.73044C11.7865 3.28654 12.2541 3.75413 12.8152 4.31518C13.1968 4.69683 13.2069 5.31263 12.8378 5.70638L11.625 7M8.625 4L11.625 7" stroke="currentColor" stroke-linecap="round"/><path d="M8 13.5H13.5" stroke="currentColor" stroke-linecap="round"/></svg>';

const TRASH_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 4L12.1801 12.199C12.0779 13.2214 11.2175 14 10.19 14H5.80998C4.78247 14 3.92214 13.2214 3.8199 12.199L3 4M13 4H14M13 4H10.5M3 4H2M3 4H5.5M10.5 4H5.5M10.5 4C10.5 2.89543 9.60457 2 8.5 2H7.5C6.39543 2 5.5 2.89543 5.5 4" stroke="currentColor" stroke-linecap="round"/></svg>';

const MINUS_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8H13" stroke="currentColor" stroke-linecap="round"/></svg>';

const PLUS_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3V13M3 8H13" stroke="currentColor" stroke-linecap="round"/></svg>';

const ARROW_LEFT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4C7 4 4 6.94592 4 8M4 8C4 9.05408 7 12 7 12M4 8H12" stroke="currentColor" stroke-linecap="round"/></svg>';

const ARROW_RIGHT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4C9 4 12 6.94592 12 8M12 8C12 9.05408 9 12 9 12M12 8H4" stroke="currentColor" stroke-linecap="round"/></svg>';

const LINK_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.66666 8.81942C6.76106 8.97402 6.87313 9.12035 7.0028 9.25528C7.8078 10.0931 9.0348 10.2241 9.97173 9.64822C10.1453 9.54148 10.3089 9.41055 10.4581 9.25528L12.6177 7.00768C13.5719 6.01464 13.5719 4.40459 12.6177 3.41154C11.6635 2.41848 10.1165 2.41849 9.16233 3.41154L8.68666 3.9066" stroke="currentColor" stroke-linecap="round"/><path d="M7.31353 12.0933L6.83767 12.5885C5.88351 13.5816 4.33647 13.5816 3.3823 12.5885C2.42812 11.5955 2.42812 9.98546 3.3823 8.9924L5.54191 6.7448C6.49609 5.75174 8.04313 5.75173 8.99727 6.7448C9.12693 6.87966 9.23893 7.026 9.33333 7.18053" stroke="currentColor" stroke-linecap="round"/></svg>';

const BROKEN_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2L14 14" stroke="currentColor" stroke-linecap="round"/><path d="M5 2H11C12.6569 2 14 3.34315 14 5V9.5V11M5 14H11C11.8284 14 12.5783 13.6643 13.1212 13.1215L9.03648 9.05728M5 14L7.2265 10.6603C7.69922 9.95118 8.32842 9.41242 9.03648 9.05728M5 14C3.34315 14 2 12.6569 2 11V5C2 4.18477 2.32517 3.44549 2.8529 2.90478L9.03648 9.05728" stroke="currentColor" stroke-linecap="round"/><path d="M5 7C5.55228 7 6 6.55228 6 6C6 5.44772 5.55228 5 5 5C4.44772 5 4 5.44772 4 6C4 6.55228 4.44772 7 5 7Z" stroke="currentColor" stroke-linecap="round"/></svg>';

/**
 * Invoked with the embed's own vault-relative target path (never a
 * `VaultResource` — see `embedPdfResolution.ts`'s own doc comment on why
 * this widget only ever deals in plain strings) when the "Open" control is
 * activated. The app layer (`PageHost.tsx`) re-resolves that path into the
 * real `VaultResource` and opens the existing `PdfOverlay` — this widget
 * never opens an overlay itself and never touches `Vault`.
 */
export type OnPdfEmbedClick = (path: string) => void;

/**
 * The rendered form of a local PDF resource embed (`![[document.pdf]]`).
 * The Embed-scoped, PDF counterpart to `ImageWidget` — deliberately its
 * own widget class rather than an extension of `ImageWidget` itself, since
 * a PDF's working-state DOM (a page canvas + text layer + minimal page/
 * zoom chrome) is nothing like an `<img>`, but it reuses every piece of
 * *lifecycle* `ImageWidget`/`imageUiState.ts` already establish: the same
 * `ImageUiState` shape for `revealed`/`broken` (via `setImageUiState`),
 * the same Edit-source button behavior (place a caret at `to`, toggle
 * `revealed`), and the same broken-state DOM/CSS classes
 * (`.cm-image-container--broken`/`.cm-image-broken*`) `ImageWidget.
 * renderBroken` already defines and styles — reused as-is here rather than
 * duplicated, so a broken PDF and a broken image render as the exact same
 * visual "unable to load" card.
 *
 * PDF page rendering itself is `pdfPageRenderer.ts`'s `renderPdfPage` — the
 * same primitive `PdfPageCanvas.tsx` (`PdfViewer`) calls — invoked directly
 * against plain DOM elements this widget builds itself (no React tree is
 * available inside a CM6 `WidgetType`). Zoom uses `pdfZoom.ts`'s canonical
 * levels, the same shared model `PdfViewer` uses; page/zoom are ephemeral,
 * widget-local state (plain closures), never round-tripped through CM6
 * dispatch — the same pattern `MarkdownEditor.tsx`'s own image-options-menu
 * `menuOpen` state already establishes for exactly this reason: `eq()`
 * doesn't compare them, so an unrelated decoration rebuild (a keystroke
 * elsewhere in the document) reuses this widget's existing DOM — and its
 * live page/zoom — rather than recreating it from scratch.
 *
 * Deliberately minimal inline chrome (page nav + zoom only) — richer
 * resource actions (Move/Archive/Reveal/Copy path) stay exclusively in the
 * full `PdfOverlay`, reached via the "Open" control
 * (`getOnPdfEmbedClick`), never duplicated here.
 */
export class PdfEmbedWidget extends WidgetType {
  constructor(
    readonly title: string,
    readonly url: string,
    /** The embed's own vault-relative target path — see `OnPdfEmbedClick`'s own doc comment for why this, not a `VaultResource`, is threaded through. */
    readonly path: string,
    readonly ui: ImageUiState,
    readonly pos: number,
    readonly to: number,
    readonly getOnPdfEmbedClick: () => OnPdfEmbedClick | undefined
  ) {
    super();
  }

  override eq(other: PdfEmbedWidget): boolean {
    return (
      this.title === other.title &&
      this.url === other.url &&
      this.path === other.path &&
      this.pos === other.pos &&
      this.to === other.to &&
      this.ui.revealed === other.ui.revealed &&
      this.ui.broken === other.ui.broken
    );
  }

  override toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    container.classList.add('cm-pdf-embed');
    container.dataset.sourceRevealed = String(this.ui.revealed);

    if (this.ui.broken) {
      return this.renderBroken(container, view);
    }

    return this.renderWorking(container, view);
  }

  private renderBroken(container: HTMLElement, view: EditorView): HTMLElement {
    // Reuses ImageWidget's own broken-card classes/CSS verbatim (see the
    // class doc comment) — no new broken-state styling for this widget.
    container.classList.add('cm-image-container--broken');

    const controls = document.createElement('div');
    controls.classList.add('cm-image-controls');
    controls.contentEditable = 'false';

    const deleteButton = this.makeButton(TRASH_ICON, 'Delete embed', () => {
      const { from, to } = computeImageDeletionRange(view.state, this.pos);
      view.dispatch({ changes: { from, to, insert: '' } });
    });
    controls.append(deleteButton, this.makeEditButton(view));

    const broken = document.createElement('div');
    broken.classList.add('cm-image-broken');

    const iconWrap = document.createElement('span');
    iconWrap.classList.add('cm-image-broken__icon-wrap');
    iconWrap.innerHTML = BROKEN_ICON;
    iconWrap.querySelector('svg')?.classList.add('cm-image-broken__icon');
    broken.append(iconWrap);

    const altSpan = document.createElement('span');
    altSpan.classList.add('cm-image-broken__alt');
    altSpan.textContent = 'Unable to load';
    broken.append(altSpan);

    const hintSpan = document.createElement('span');
    hintSpan.classList.add('cm-image-broken__hint');
    hintSpan.textContent = this.path;
    broken.append(hintSpan);

    container.append(controls, broken);
    return container;
  }

  private renderWorking(container: HTMLElement, view: EditorView): HTMLElement {
    container.classList.add('cm-pdf-embed-container');

    const header = document.createElement('div');
    header.classList.add('cm-pdf-embed__header');
    header.contentEditable = 'false';

    const icon = document.createElement('span');
    icon.classList.add('cm-pdf-embed__icon');
    icon.innerHTML = PDF_ICON;

    const title = document.createElement('span');
    title.classList.add('cm-pdf-embed__title');
    title.textContent = this.title;
    title.title = this.title;

    const zoomIndicator = document.createElement('span');
    zoomIndicator.classList.add('cm-pdf-embed__zoom-indicator');

    const pageIndicator = document.createElement('span');
    pageIndicator.classList.add('cm-pdf-embed__page-indicator');
    pageIndicator.hidden = true;

    const controls = document.createElement('div');
    controls.classList.add('cm-image-controls');
    controls.contentEditable = 'false';

    const zoomOutButton = this.makeButton(MINUS_ICON, 'Zoom out', () => zoomBy('out'));
    const zoomInButton = this.makeButton(PLUS_ICON, 'Zoom in', () => zoomBy('in'));
    const prevPageButton = this.makeButton(ARROW_LEFT_ICON, 'Previous page', () => goToPage(-1));
    prevPageButton.hidden = true;
    const nextPageButton = this.makeButton(ARROW_RIGHT_ICON, 'Next page', () => goToPage(1));
    nextPageButton.hidden = true;
    const openButton = this.makeButton(LINK_ICON, 'Open in PDF viewer', () => {
      this.getOnPdfEmbedClick()?.(this.path);
    });

    controls.append(
      zoomOutButton,
      zoomIndicator,
      zoomInButton,
      prevPageButton,
      pageIndicator,
      nextPageButton,
      openButton,
      this.makeEditButton(view)
    );

    header.append(icon, title);

    const scroll = document.createElement('div');
    scroll.classList.add('cm-pdf-embed__scroll');
    const status = document.createElement('div');
    status.classList.add('cm-pdf-embed__status');
    status.textContent = 'Loading PDF…';
    scroll.append(status);

    container.append(header, controls, scroll);

    let destroyed = false;
    let doc: PDFDocumentProxy | null = null;
    let numPages = 0;
    let currentPage = 1;
    let zoomIndex = DEFAULT_ZOOM_INDEX;
    let renderHandle: RenderPdfPageHandle | null = null;

    const updateChrome = () => {
      zoomIndicator.textContent = `${zoomPercentAt(zoomIndex)}%`;
      zoomOutButton.disabled = zoomIndex <= 0;
      zoomInButton.disabled = zoomIndex >= ZOOM_LEVELS_PERCENT.length - 1;
      pageIndicator.hidden = numPages <= 1;
      prevPageButton.hidden = numPages <= 1;
      nextPageButton.hidden = numPages <= 1;
      pageIndicator.textContent = `${currentPage} / ${numPages}`;
      prevPageButton.disabled = currentPage <= 1;
      nextPageButton.disabled = currentPage >= numPages;
    };

    const renderCurrentPage = () => {
      if (!doc) {
        return;
      }
      renderHandle?.cancel();

      const pageWrap = document.createElement('div');
      pageWrap.classList.add('pdf-viewer__page');
      const canvas = document.createElement('canvas');
      canvas.classList.add('pdf-viewer__page-canvas');
      const textLayerMount = document.createElement('div');
      pageWrap.append(canvas, textLayerMount);
      scroll.replaceChildren(pageWrap);

      const pageNumber = currentPage;
      const scale = zoomPercentAt(zoomIndex) / 100;
      void doc.getPage(pageNumber).then((page) => {
        if (destroyed || currentPage !== pageNumber) {
          return;
        }
        renderHandle = renderPdfPage({ page, canvas, textLayerContainer: textLayerMount, containerEl: pageWrap, scale });
      });

      updateChrome();
    };

    const zoomBy = (direction: 'in' | 'out') => {
      zoomIndex = stepZoomIndex(zoomIndex, direction);
      renderCurrentPage();
    };

    const goToPage = (delta: number) => {
      const next = currentPage + delta;
      if (next < 1 || next > numPages) {
        return;
      }
      currentPage = next;
      renderCurrentPage();
    };

    updateChrome();

    getDocument(this.url).promise.then(
      (loadedDoc) => {
        if (destroyed) {
          return;
        }
        doc = loadedDoc;
        numPages = loadedDoc.numPages;
        renderCurrentPage();
      },
      () => {
        if (destroyed) {
          return;
        }
        // Same mechanism ImageWidget uses for a genuine `<img>` load
        // failure — a real, observed failure to load/parse this exact
        // PDF, dispatched through the shared `imageUiState` field so the
        // next decoration rebuild constructs this widget in its broken
        // state. Never a guess from the raw Markdown text.
        view.dispatch({
          effects: setImageUiState.of({ pos: this.pos, to: this.to, state: { ...this.ui, broken: true } }),
        });
      }
    );

    (container as HTMLElement & { [PDF_EMBED_DESTROY]?: () => void })[PDF_EMBED_DESTROY] = () => {
      destroyed = true;
      renderHandle?.cancel();
      void doc?.destroy();
    };

    return container;
  }

  override destroy(dom: HTMLElement): void {
    (dom as HTMLElement & { [PDF_EMBED_DESTROY]?: () => void })[PDF_EMBED_DESTROY]?.();
  }

  /** Shared by both renderWorking/renderBroken — same Edit-source contract `ImageWidget.makeEditButton` establishes. */
  private makeEditButton(view: EditorView): HTMLButtonElement {
    return this.makeButton(
      EDIT_ICON,
      this.ui.revealed ? 'Hide source' : 'Edit source',
      () => {
        const revealing = !this.ui.revealed;
        view.dispatch({
          effects: setImageUiState.of({
            pos: this.pos,
            to: this.to,
            state: { ...this.ui, revealed: revealing },
          }),
          selection: revealing ? EditorSelection.cursor(this.to) : undefined,
          scrollIntoView: revealing,
        });
      }
    );
  }

  private makeButton(iconHtml: string, label: string, onActivate: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('cm-image-control');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = iconHtml;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onActivate();
    });
    return button;
  }
}

/** Private symbol keying this widget's own teardown closure onto its root DOM element — see `destroy()`'s own use. */
const PDF_EMBED_DESTROY = Symbol('pdfEmbedDestroy');
