import { EditorSelection } from '@codemirror/state';
import { WidgetType, type EditorView } from '@codemirror/view';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import '@features/pdf/pdfWorker';
// `.pdf-viewer__page`/`.pdf-viewer__page-canvas`/`.pdf-viewer__status`/
// `.pdf-viewer__spinner`/`.pdf-viewer__page-indicator`/`.pdf-viewer__title`/
// `.textLayer` are flat, un-namespaced class selectors (no `.pdf-viewer`
// ancestor requirement, confirmed by reading PdfViewer.css directly) — this
// widget reuses that exact per-page rendering CSS (the same primitive
// `PdfPageCanvas.tsx`/`PdfViewer` uses for each page canvas + text layer)
// plus the page-indicator's and title's own text styling, so a page/title
// renders/reads identically in both places. It does NOT reuse any of
// `PdfViewer.css`'s reader-chrome *layout* classes (`__toolbar`/
// `__control-group`/`__zoom-indicator`/`__scroll`) — this embed is a page
// preview + simple pagination, not a miniature reader; see this file's own
// class doc comment.
import '@features/pdf/PdfViewer.css';
import { renderPdfPage, type RenderPdfPageHandle } from '@features/pdf/pdfPageRenderer';
import { getAvailableViewerWidth } from '@features/pdf/pdfFitWidth';
import { computeFitScale } from '@features/pdf/pdfZoom';

import { computeImageDeletionRange } from '../image/imageDeletion';
import { setImageUiState, type ImageUiState } from '../image/imageUiState';
import type { PdfDocumentCache } from './pdfDocumentCache';
import { applyMediaAlignment, applyMediaWidth, disconnectMediaWidthObserver, type ResizeObserverHolder } from '../mediaPresentation/mediaLayoutStyle';
import type { PdfPresentation } from '../mediaPresentation/mediaPresentationModel';

import './PdfEmbedWidget.css';

// Hand-copied inline SVGs, same raw-DOM-widget convention ImageWidget.ts
// already establishes (no React tree is available inside a CM6 WidgetType,
// so the app's real AppIcon component system can't mount here). EDIT_ICON/
// TRASH_ICON/MORE_ICON/EXPAND_ICON/ARROW_LEFT_ICON/ARROW_RIGHT_ICON are the
// exact same paths ImageWidget.ts/iconRegistry.ts already use (`trash.svg`/
// `more-horizontal.svg`/`expand-diagonal.svg`, the same glyph
// `iconRegistry.ts` registers as `expandDiagonal`; the arrow icons match
// `PdfViewer`'s own Previous/Next page glyphs); BROKEN_ICON is hand-copied
// from its own shared/icon/svg source.

const EDIT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.625 4L3.64738 9.30947C3.22603 9.7589 2.95326 10.3272 2.86614 10.937L2.64142 12.5101C2.57071 13.005 2.99497 13.4293 3.48995 13.3586L4.95655 13.1491C5.63195 13.0526 6.25428 12.7288 6.7209 12.231L11.625 7M8.625 4L9.79364 2.75345C10.18 2.34132 10.831 2.33098 11.2304 2.73044C11.7865 3.28654 12.2541 3.75413 12.8152 4.31518C13.1968 4.69683 13.2069 5.31263 12.8378 5.70638L11.625 7M8.625 4L11.625 7" stroke="currentColor" stroke-linecap="round"/><path d="M8 13.5H13.5" stroke="currentColor" stroke-linecap="round"/></svg>';

const TRASH_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 4L12.1801 12.199C12.0779 13.2214 11.2175 14 10.19 14H5.80998C4.78247 14 3.92214 13.2214 3.8199 12.199L3 4M13 4H14M13 4H10.5M3 4H2M3 4H5.5M10.5 4H5.5M10.5 4C10.5 2.89543 9.60457 2 8.5 2H7.5C6.39543 2 5.5 2.89543 5.5 4" stroke="currentColor" stroke-linecap="round"/></svg>';

// Same glyph `iconRegistry.ts` registers as `moreHorizontal` — hand-copied
// verbatim (no React tree available here) for the More actions control.
const MORE_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="3.5" cy="8" r="1.25" fill="currentColor"/><circle cx="8" cy="8" r="1.25" fill="currentColor"/><circle cx="12.5" cy="8" r="1.25" fill="currentColor"/></svg>';

// Same glyph `iconRegistry.ts` registers as `expandDiagonal` — hand-copied
// verbatim (no React tree available here, so `AppIcon icon="expandDiagonal"`
// itself can't mount) so the Expand control's icon matches the app's own
// "open in a bigger surface" affordance: a pair of diagonal arrows pointing
// away from each other, not a bounding square.
const EXPAND_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.3887 12.417C2.92818 11.9565 3.00477 10 3.00477 10M3.3887 12.417C3.84922 12.8775 5.80563 12.8009 5.80563 12.8009M3.3887 12.417L7 9" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.4169 3.38871C11.9564 2.92819 9.99999 3.00478 9.99999 3.00478M12.4169 3.38871C12.8774 3.84923 12.8008 5.80564 12.8008 5.80564M12.4169 3.38871L9 7" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Same two glyphs PdfViewer's own Previous/Next page toolbar buttons use
// (hand-copied — the raw-DOM-widget reason above).
const ARROW_LEFT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4C7 4 4 6.94592 4 8M4 8C4 9.05408 7 12 7 12M4 8H12" stroke="currentColor" stroke-linecap="round"/></svg>';

const ARROW_RIGHT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4C9 4 12 6.94592 12 8M12 8C12 9.05408 9 12 9 12M12 8H4" stroke="currentColor" stroke-linecap="round"/></svg>';

const BROKEN_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2L14 14" stroke="currentColor" stroke-linecap="round"/><path d="M5 2H11C12.6569 2 14 3.34315 14 5V9.5V11M5 14H11C11.8284 14 12.5783 13.6643 13.1212 13.1215L9.03648 9.05728M5 14L7.2265 10.6603C7.69922 9.95118 8.32842 9.41242 9.03648 9.05728M5 14C3.34315 14 2 12.6569 2 11V5C2 4.18477 2.32517 3.44549 2.8529 2.90478L9.03648 9.05728" stroke="currentColor" stroke-linecap="round"/><path d="M5 7C5.55228 7 6 6.55228 6 6C6 5.44772 5.55228 5 5 5C4.44772 5 4 5.44772 4 6C4 6.55228 4.44772 7 5 7Z" stroke="currentColor" stroke-linecap="round"/></svg>';

/**
 * Invoked with the embed's own vault-relative target path (never a
 * `VaultResource` — see `embedPdfResolution.ts`'s own doc comment on why
 * this widget only ever deals in plain strings) when the "Expand" control is
 * activated. The app layer (`PageHost.tsx`) re-resolves that path into the
 * real `VaultResource` and opens the existing `PdfOverlay` — this widget
 * never opens an overlay itself and never touches `Vault`.
 */
export type OnPdfEmbedClick = (path: string) => void;

export interface OpenPdfMenuParams {
  readonly anchor: HTMLElement;
  /** Already-resolved by `embedPdfResolution.ts` — see that file's own doc comment for why a PDF embed's `resourceId` needs no separate click-time lookup the way `ImageWidget`'s does. */
  readonly resourceId: string;
}

/**
 * Invoked when the "More actions" control is activated — the app layer
 * (`MarkdownEditor.tsx`) opens the shared Resource menu
 * (`PdfEmbedMoreActions.tsx`, the same menu `PdfViewerMoreActions`/
 * `ImageOverlayMoreActions`/the Sidebar row already show) anchored to the
 * given button. Same injected-getter shape as `OnPdfEmbedClick`/
 * `OnOpenImageMenu`.
 */
export type OnOpenPdfMenu = (params: OpenPdfMenuParams) => void;

/**
 * The rendered form of a local PDF resource embed (`![[document.pdf]]`) —
 * a **single-page preview with pagination**, not a miniature PDF reader.
 * `PdfOverlay`/`PdfViewer` remain the only full reader (zoom, its own page
 * navigation/counter, "More actions"/Download, text selection at every
 * zoom level) — this widget renders exactly ONE page at a time, fit to the
 * available editor width, with Previous/Next controls to move between
 * pages. No inline zoom, no vertical multi-page stack, no scroll region at
 * all — the page's own natural height at the fit-width scale is whatever
 * it is; nothing here crops or scrolls it.
 *
 * The Embed-scoped, PDF counterpart to `ImageWidget` — deliberately its own
 * widget class rather than an extension of `ImageWidget` itself, since a
 * PDF's working-state DOM (a page canvas + text layer + pagination) is
 * nothing like an `<img>`, but it reuses every piece of *lifecycle*
 * `ImageWidget`/`imageUiState.ts` already establish: the same
 * `ImageUiState` shape for `revealed`/`broken` (via `setImageUiState`), the
 * same Edit-source button behavior (place a caret at `to`, toggle
 * `revealed`), and the same broken-state DOM/CSS classes
 * (`.cm-image-container--broken`/`.cm-image-broken*`) `ImageWidget.
 * renderBroken` already defines and styles — reused as-is here rather than
 * duplicated, so a broken PDF and a broken image render as the exact same
 * visual "unable to load" card.
 *
 * PDF page rendering itself is `pdfPageRenderer.ts`'s `renderPdfPage` — the
 * same primitive `PdfPageCanvas.tsx` (`PdfViewer`) calls — invoked directly
 * against plain DOM elements this widget builds itself (no React tree is
 * available inside a CM6 `WidgetType`). The fit-to-width scale
 * (`computeFitScale`/`getAvailableViewerWidth`, `@features/pdf/pdfZoom.ts`/
 * `pdfFitWidth.ts`) is the exact same calculation `PdfViewer`'s own default
 * view uses — one shared primitive, two consumers — computed fresh from
 * *the current page's own* natural width every render (a PDF's pages can
 * legitimately differ in size), never a manual zoom. `currentPage`/`doc`/
 * `numPages`/the in-flight render handle are ephemeral, widget-local state
 * (plain closures), never round-tripped through CM6 dispatch — the same
 * pattern `MarkdownEditor.tsx`'s own image-options-menu `menuOpen` state
 * already establishes for exactly this reason: `eq()` doesn't compare
 * them, so an unrelated decoration rebuild (a keystroke elsewhere in the
 * document) reuses this widget's existing DOM — and whichever page/scale
 * it's already showing — rather than recreating it from scratch.
 *
 * A top row (title + Expand/Edit source/More actions, mirroring
 * `PdfViewer`'s own toolbar layout — title on the left, styled with the
 * exact same `.pdf-viewer__title` text styling `PdfViewer.css` already
 * defines, reused verbatim rather than redefined here) sits above the
 * page; the action buttons are built from the exact same floating-control
 * button visual system `ImageWidget.ts`'s own controls use
 * (`.cm-image-controls`/`.cm-image-control`, chrome from
 * `ImageFloatingControls.css`, reused verbatim — see `PdfEmbedWidget.css`'s
 * own doc comment for the layout-only rules this file adds on top) and
 * reveal on hover/focus, same as `ImageWidget`'s own controls; the title
 * itself is always visible. Expand opens the existing `PdfOverlay` for
 * this same resource via `getOnPdfEmbedClick` — never a second PDF reader.
 *
 * Page navigation is its own, differently-styled floating pill
 * (`.cm-pdf-embed-pagination`, a dedicated class — not the shared
 * `.cm-image-controls` chrome), centered at the bottom of the page.
 * Unlike the top row, the page indicator ("1 / 4") inside it is always
 * visible; only the Previous/Next arrow buttons reveal on hover/focus of
 * the pill itself. Hidden entirely for a single-page document, matching
 * `PdfViewer`'s own convention for its page-nav group.
 */
export class PdfEmbedWidget extends WidgetType {
  constructor(
    readonly title: string,
    readonly url: string,
    /** The embed's own vault-relative target path — see `OnPdfEmbedClick`'s own doc comment for why this, not a `VaultResource`, is threaded through. */
    readonly path: string,
    /** See `OpenPdfMenuParams`'s own doc comment. */
    readonly resourceId: string,
    readonly ui: ImageUiState,
    readonly pos: number,
    readonly to: number,
    readonly getOnPdfEmbedClick: () => OnPdfEmbedClick | undefined,
    readonly getOnOpenPdfMenu: () => OnOpenPdfMenu | undefined,
    /** Shared across every `PdfEmbedWidget` reconstruction for this editor — see `pdfDocumentCache.ts`'s own doc comment for why this exists (the reveal-toggle flicker fix) and why individual widgets never destroy the document themselves. */
    readonly docCache: PdfDocumentCache,
    /** Persisted width/alignment (resize milestone) — a PDF embed has no mode concept, unlike `ImageWidget`'s `presentation`. Defaulted so every pre-existing construction site keeps compiling unchanged. */
    readonly presentation: PdfPresentation = { width: 11, alignment: 'left' }
  ) {
    super();
  }

  /** See `ImageWidget.ts`'s own `widthObserver` doc comment — identical role, identical lifecycle. */
  private readonly widthObserver: ResizeObserverHolder = { current: null };

  override eq(other: PdfEmbedWidget): boolean {
    return (
      this.title === other.title &&
      this.url === other.url &&
      this.path === other.path &&
      this.resourceId === other.resourceId &&
      this.pos === other.pos &&
      this.to === other.to &&
      this.ui.revealed === other.ui.revealed &&
      this.ui.broken === other.ui.broken &&
      this.presentation.width === other.presentation.width &&
      this.presentation.alignment === other.presentation.alignment
    );
  }

  /**
   * See `ImageWidget.ts`'s own `updateDOM` doc comment for the full
   * account (same flicker bug, same CM6 pattern, same fix) — this is its
   * PDF counterpart. Simpler here: there is no mode/`<img>` swap to
   * reconcile, only the container's own width/alignment, and the
   * existing per-page fit-scale `ResizeObserver` already watching
   * `pageHost` (`renderWorking`'s own, unrelated to this method) picks up
   * a width change and re-renders the current page at the new scale on
   * its own — this method never needs to touch PDF rendering directly.
   */
  override updateDOM(dom: HTMLElement, view: EditorView, from: PdfEmbedWidget): boolean {
    // See `ImageWidget.ts`'s own `updateDOM` doc comment for why `to` is
    // deliberately excluded from this comparison (it legitimately shifts
    // on a pure presentation update) and why `dom.dataset.nodeTo` — kept
    // current below — is what every surviving control's closure reads
    // instead of `this.to` directly.
    if (
      this.ui.broken ||
      from.ui.broken ||
      this.title !== from.title ||
      this.url !== from.url ||
      this.path !== from.path ||
      this.resourceId !== from.resourceId ||
      this.pos !== from.pos ||
      this.ui.revealed !== from.ui.revealed
    ) {
      return false;
    }

    dom.dataset.nodeTo = String(this.to);
    disconnectMediaWidthObserver(from.widthObserver);
    applyMediaAlignment(dom, this.presentation.alignment);
    applyMediaWidth(dom, null, this.presentation.width, view, this.widthObserver);
    return true;
  }

  override toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div');
    // `cm-media-block` — see `ImageWidget.ts`'s own `toDOM` doc comment
    // and MarkdownEditor.css's own doc comment for the shared global
    // media/embed block-flow contract this class enforces.
    container.classList.add('cm-pdf-embed', 'cm-media-block');
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
    applyMediaAlignment(container, this.presentation.alignment);
    applyMediaWidth(container, null, this.presentation.width, view, this.widthObserver);

    // See `ImageWidget.ts`'s own `makeEditButton` doc comment — the same
    // live-`to` reasoning applies here (`toggleRevealed`).
    container.dataset.nodeTo = String(this.to);
    const getCurrentTo = () => Number(container.dataset.nodeTo);

    // The single current-page host — this is what `getAvailableViewerWidth`
    // measures (a stable, full-width element; the `.pdf-viewer__page`
    // wrapper it holds is itself `width: fit-content`, so it can't be used
    // for that measurement directly). Starts showing the loading spinner,
    // replaced with the actual page once the document/page load.
    const pageHost = document.createElement('div');
    pageHost.classList.add('cm-pdf-embed-page');
    const status = document.createElement('div');
    status.classList.add('pdf-viewer__status');
    const spinner = document.createElement('span');
    spinner.classList.add('pdf-viewer__spinner');
    spinner.setAttribute('aria-hidden', 'true');
    const statusText = document.createElement('span');
    statusText.textContent = 'Loading PDF…';
    status.append(spinner, statusText);
    pageHost.append(status);

    // Top row: title (always visible, `.pdf-viewer__title`'s own styling —
    // see PdfViewer.css) + the Expand/Edit source/More actions cluster
    // (hover/focus-reveal, same as `ImageWidget`'s own controls).
    const controlsRow = document.createElement('div');
    controlsRow.classList.add('cm-pdf-embed-controls');
    controlsRow.contentEditable = 'false';

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('pdf-viewer__title');
    titleSpan.textContent = this.title;
    titleSpan.title = this.title;

    const actionsGroup = document.createElement('div');
    actionsGroup.classList.add('cm-image-controls');
    const moreActionsButton = this.makeButton(MORE_ICON, 'More actions', () => {
      this.getOnOpenPdfMenu()?.({ anchor: moreActionsButton, resourceId: this.resourceId });
    });
    const expandButton = this.makeButton(EXPAND_ICON, 'Expand', () => {
      this.getOnPdfEmbedClick()?.(this.path);
    });
    // Expand, then Edit source, then More actions last (far right) — the
    // two direct content-manipulation actions read left-to-right before
    // the catch-all overflow menu.
    actionsGroup.append(expandButton, this.makeEditButton(view, getCurrentTo), moreActionsButton);

    controlsRow.append(titleSpan, actionsGroup);

    // The page-navigation pill — its own dedicated class
    // (`.cm-pdf-embed-pagination`, not the shared `.cm-image-controls`
    // chrome), floating at the bottom-center of the page. The indicator
    // text is always visible; only the arrow buttons reveal on hover/focus
    // of the pill itself (see PdfEmbedWidget.css).
    const pagination = document.createElement('div');
    pagination.classList.add('cm-pdf-embed-pagination');
    pagination.contentEditable = 'false';
    const pageIndicator = document.createElement('span');
    pageIndicator.classList.add('pdf-viewer__page-indicator');
    const prevButton = this.makeButton(ARROW_LEFT_ICON, 'Previous page', () => goToPage(-1));
    const nextButton = this.makeButton(ARROW_RIGHT_ICON, 'Next page', () => goToPage(1));
    pagination.append(prevButton, pageIndicator, nextButton);
    // Hidden until the document is ready (mirrors `PdfViewer`'s own
    // ready-gate) and for a single-page document — same convention
    // `PdfViewer`'s own toolbar already follows for its page-nav group.
    pagination.hidden = true;

    container.append(controlsRow, pageHost, pagination);

    // A JS-tracked hover class, not bare CSS `:hover` — `renderCurrentPage()`
    // below replaces `pageHost`'s children in place on every page-nav
    // click/resize, and browsers can fail to re-evaluate `:hover` once the
    // DOM under the pointer is mutated mid-hover (a "sticky hover" quirk:
    // confirmed directly — the floating controls/pagination arrows got
    // stuck visible after the very first hover, exactly the DOM-mutation
    // timing this causes). `mouseenter`/`mouseleave` are real, discrete
    // pointer-boundary-crossing events, not re-derived from current layout
    // the way `:hover` is, so they aren't susceptible to the same
    // staleness — see PdfEmbedWidget.css's own matching selector.
    container.addEventListener('mouseenter', () => {
      container.classList.add('cm-pdf-embed-container--hover');
    });
    container.addEventListener('mouseleave', () => {
      container.classList.remove('cm-pdf-embed-container--hover');
    });

    let destroyed = false;
    let doc: PDFDocumentProxy | null = null;
    let numPages = 0;
    let currentPage = 1;
    let availableWidth = getAvailableViewerWidth(pageHost);
    let renderHandle: RenderPdfPageHandle | null = null;
    // Guards a stale, still-in-flight `getPage().then()` from a superseded
    // `renderCurrentPage()` call (a fast page-nav click or resize) from
    // replacing `pageHost`'s content after a newer call already has.
    let renderToken = 0;

    const updateChrome = () => {
      pagination.hidden = !doc || numPages <= 1;
      pageIndicator.textContent = `${currentPage} / ${numPages}`;
      // `setButtonDisabled` (aria-disabled, not the native `disabled`
      // property) — see that method's own doc comment for why: this is
      // the actual root cause of Previous/Next's asymmetric hover
      // behavior, not anything CSS-side.
      this.setButtonDisabled(prevButton, currentPage <= 1);
      this.setButtonDisabled(nextButton, currentPage >= numPages);
    };

    const renderCurrentPage = () => {
      if (!doc) {
        return;
      }
      const token = ++renderToken;
      const pageNumber = currentPage;

      void doc.getPage(pageNumber).then((page) => {
        if (destroyed || token !== renderToken) {
          return;
        }
        renderHandle?.cancel();

        // Computed fresh from *this* page's own natural width — a PDF's
        // pages can legitimately differ in size, so this is never cached
        // across pages (see the class doc comment).
        const baseWidth = page.getViewport({ scale: 1 }).width;
        const scale = computeFitScale(availableWidth, baseWidth);

        const pageWrap = document.createElement('div');
        pageWrap.classList.add('pdf-viewer__page');
        const canvas = document.createElement('canvas');
        canvas.classList.add('pdf-viewer__page-canvas');
        const textLayerMount = document.createElement('div');
        pageWrap.append(canvas, textLayerMount);
        pageHost.replaceChildren(pageWrap);

        renderHandle = renderPdfPage({ page, canvas, textLayerContainer: textLayerMount, containerEl: pageWrap, scale });
        updateChrome();
      });
    };

    const goToPage = (delta: number) => {
      const next = currentPage + delta;
      if (next < 1 || next > numPages) {
        return;
      }
      currentPage = next;
      renderCurrentPage();
    };

    // Keeps `availableWidth` live so resizing the editor column
    // recalculates and re-renders the *current* page at the new fit scale
    // (product requirement: resize) — the same `ResizeObserver` role
    // `PdfViewer`'s own effect plays, applied to this widget's own
    // `pageHost` element since no React ref/effect is available inside a
    // CM6 `WidgetType`. Never changes `currentPage` itself.
    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = getAvailableViewerWidth(pageHost);
      if (nextWidth === availableWidth) {
        return;
      }
      availableWidth = nextWidth;
      renderCurrentPage();
    });
    resizeObserver.observe(pageHost);

    this.docCache.get(this.url).then(
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
      resizeObserver.disconnect();
      // Deliberately does NOT destroy `doc` — it's owned by `docCache`,
      // shared across every reconstruction of this same URL for this
      // editor's lifetime. See pdfDocumentCache.ts's own doc comment.
    };

    return container;
  }

  override destroy(dom: HTMLElement): void {
    disconnectMediaWidthObserver(this.widthObserver);
    (dom as HTMLElement & { [PDF_EMBED_DESTROY]?: () => void })[PDF_EMBED_DESTROY]?.();
  }

  /** Shared dispatch behind every Edit/Hide source control — same reveal-toggle contract `ImageWidget.makeEditButton` establishes. `to` is read live (see `makeEditButton`'s own `getTo` parameter) rather than `this.to` directly — see `ImageWidget.ts`'s `makeEditButton` doc comment for why. */
  private toggleRevealed(view: EditorView, getTo: () => number): void {
    const revealing = !this.ui.revealed;
    const to = getTo();
    view.dispatch({
      effects: setImageUiState.of({
        pos: this.pos,
        to,
        state: { ...this.ui, revealed: revealing },
      }),
      selection: revealing ? EditorSelection.cursor(to) : undefined,
      scrollIntoView: revealing,
    });
  }

  /**
   * Shared by both the broken card's controls and the working state's
   * floating controls — see the class doc comment for why Edit source
   * must behave identically in both. `getTo` (default `() => this.to`)
   * mirrors `ImageWidget.ts`'s own `makeEditButton` parameter — the
   * broken card never goes through `updateDOM` (always a full rebuild),
   * so it keeps the simple default; `renderWorking` passes its own live
   * `container.dataset.nodeTo` reader instead.
   */
  private makeEditButton(view: EditorView, getTo: () => number = () => this.to): HTMLButtonElement {
    return this.makeButton(EDIT_ICON, this.ui.revealed ? 'Hide source' : 'Edit source', () =>
      this.toggleRevealed(view, getTo)
    );
  }

  /** Builds one floating control button — `ImageWidget.ts`'s own `makeButton`, reused verbatim (same classes/markup/event-handling), not a second button implementation. */
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
      // `aria-disabled`, not the native `disabled` property — see
      // `setButtonDisabled`'s own doc comment for why only Previous/Next
      // ever use this guard (every other button here is never disabled).
      if (button.getAttribute('aria-disabled') === 'true') {
        return;
      }
      onActivate();
      // Without this, a clicked button (Previous/Next in particular, since
      // — unlike the other controls here — clicking it doesn't move focus
      // elsewhere, e.g. into an opened menu or the editor's own selection)
      // keeps DOM focus indefinitely, which keeps `:focus-within` on
      // `.cm-pdf-embed-container` permanently true — the reveal-on-hover
      // CSS (PdfEmbedWidget.css) then never goes back to hidden once
      // clicked, even after the pointer moves away. Blurring immediately
      // after the click's own effect runs restores the normal
      // hover-only-while-actually-hovering behavior.
      button.blur();
    });
    return button;
  }

  /**
   * Sets a floating-control button's disabled state via `aria-disabled` +
   * a visual-only CSS class — deliberately NEVER the native `disabled`
   * property/attribute. This is the actual root cause of Previous/Next's
   * asymmetric floating-control visibility (confirmed by inspection, not
   * assumed): a native `disabled` form control is excluded from normal
   * mouse hit-testing in every major browser engine — it cannot itself
   * dispatch (or correctly participate in the bubble/capture chain for)
   * `mouseenter`/`mouseleave`/`mouseover`/`mouseout`. Since exactly one of
   * Previous/Next is disabled at any given time (never both, never
   * neither, on a multi-page document) and which one flips as the user
   * navigates, that one button's presence intermittently created a "hole"
   * in the pagination pill's hit-test region — the precise, demonstrated
   * mechanism behind the reported bug ("after hovering once, one arrow
   * stays visible/stuck"), not a CSS specificity or selector issue (the
   * reveal rules themselves, in `PdfEmbedWidget.css`, already treat both
   * buttons identically). `aria-disabled` keeps the button fully
   * mouse-interactive (hoverable, focusable) while this class's own click
   * handler still refuses to invoke `onActivate()` for it — the same
   * "visually and functionally disabled, but not a native disabled
   * control" pattern used for exactly this reason in accessible web UIs
   * generally.
   */
  private setButtonDisabled(button: HTMLButtonElement, disabled: boolean): void {
    button.setAttribute('aria-disabled', String(disabled));
    // Visual dimming only (PdfEmbedWidget.css) — deliberately a class, not
    // the native `disabled` property; see this method's own doc comment.
    button.classList.toggle('cm-image-control--disabled', disabled);
  }
}

/** Private symbol keying this widget's own teardown closure onto its root DOM element — see `destroy()`'s own use. */
const PDF_EMBED_DESTROY = Symbol('pdfEmbedDestroy');
