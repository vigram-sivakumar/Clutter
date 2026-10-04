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

import { computeEmbedRemovalRange } from '../mediaPresentation/embedRemovalRange';
import { setImageUiState, type ImageUiState } from '../image/imageUiState';
import { EDIT_ICON, renderInvalidEmbedCard } from '../mediaPresentation/invalidEmbedCard';
import { EXPAND_ICON, MORE_ICON } from '../mediaPresentation/embedControlIcons';
import type { PdfDocumentCache } from './pdfDocumentCache';
import { applyMediaAlignment, applyMediaWidth, disconnectMediaWidthObserver, type ResizeObserverHolder } from '../mediaPresentation/mediaLayoutStyle';
import type { PdfPresentation } from '../mediaPresentation/mediaPresentationModel';
import { attachPdfResizeHandle } from './pdfResizeHandle';

import './PdfEmbedWidget.css';

// Hand-copied inline SVGs, same raw-DOM-widget convention ImageWidget.ts
// already establishes (no React tree is available inside a CM6 WidgetType,
// so the app's real AppIcon component system can't mount here).
// ARROW_LEFT_ICON/ARROW_RIGHT_ICON match `PdfViewer`'s own Previous/Next
// page glyphs; BROKEN_PDF_ICON is hand-copied from `iconRegistry.ts`'s
// own `pdf` entry (`shared/icon/svg/pdf.svg`) — deliberately not
// `image.svg` (ImageWidget.ts's own `IMAGE_ICON`): a failed PDF embed is
// still a PDF, not an image, so its broken-state icon stays a PDF glyph
// rather than borrowing the image family's. EXPAND_ICON/
// MORE_ICON now live in `../mediaPresentation/embedControlIcons.ts`,
// shared with `NoteEmbedWidget.ts`'s own Expand/More actions controls; the
// Remove/Edit icons live in `../mediaPresentation/invalidEmbedCard.ts`,
// shared with `ImageWidget.ts`'s own equivalents — none of these three are
// media-specific.

// Same two glyphs PdfViewer's own Previous/Next page toolbar buttons use
// (hand-copied — the raw-DOM-widget reason above).
const ARROW_LEFT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 4C7 4 4 6.94592 4 8M4 8C4 9.05408 7 12 7 12M4 8H12" stroke="currentColor" stroke-linecap="round"/></svg>';

const ARROW_RIGHT_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4C9 4 12 6.94592 12 8M12 8C12 9.05408 9 12 9 12M12 8H4" stroke="currentColor" stroke-linecap="round"/></svg>';

const BROKEN_PDF_ICON =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 13.3571H3.11111C3.47947 13.3571 3.83274 13.2066 4.0932 12.9387C4.35367 12.6708 4.5 12.3075 4.5 11.9286C4.5 11.5497 4.35367 11.1863 4.0932 10.9184C3.83274 10.6505 3.47947 10.5 3.11111 10.5H2V14.5" stroke="currentColor" stroke-linecap="round"/><path d="M6.75 10.5V14.5H7.65909C8.08103 14.5 8.48568 14.2893 8.78403 13.9142C9.08239 13.5391 9.25 13.0304 9.25 12.5C9.25 11.9696 9.08239 11.4609 8.78403 11.0858C8.48568 10.7107 8.08103 10.5 7.65909 10.5H6.75Z" stroke="currentColor" stroke-linecap="round"/><path d="M11.5 14.5V12.4429M11.5 12.4429V10.5H14M11.5 12.4429H13.5238" stroke="currentColor" stroke-linecap="round"/><path d="M14 8.5V7V6M2 8.5V4C2 2.34315 3.34315 1 5 1H6H8H9M9 1V3C9 4.65685 10.3431 6 12 6H14M9 1C9.64029 1 10.2544 1.25435 10.7071 1.70711L13.2929 4.29289C13.7456 4.74565 14 5.35971 14 6" stroke="currentColor" stroke-linecap="round"/></svg>';

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
  /**
   * The embed's own `Embed` node position — what the menu's own "Remove"
   * item (embed-level, never touching the source resource) needs to
   * compute its removal range via `computeEmbedRemovalRange`. Safe to
   * capture once (unlike `to`): confirmed by `ImageWidget.ts`'s
   * `makeEditButton` doc comment that a node's own `from` never shifts
   * under a presentation-only patch, only `to` can.
   */
  readonly pos: number;
  /** The embed's end — what its presentation (width/alignment) is read and rewritten by. Read when the button is clicked, so it is current. */
  readonly to: number;
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
 * (`.cm-invalid-embed`/`.cm-invalid-embed__*`) `invalidEmbedCard.ts`
 * already defines and styles — reused as-is here rather than duplicated,
 * so a broken PDF and a broken image render as the same "unable to load"
 * card layout. The one deliberate difference: the icon
 * itself (`BROKEN_PDF_ICON`, below) is the `pdf` glyph, not `ImageWidget.
 * ts`'s own `IMAGE_ICON` — a failed PDF embed is still a PDF, not an
 * image, so its broken state stays visually identifiable as one.
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
 * page; the action buttons are built from their own independent,
 * self-contained `.cm-pdf-controls`/`.cm-pdf-control` chrome
 * (`PdfEmbedWidget.css`) — deliberately *not* the shared
 * `.cm-media-controls`/`.cm-media-control` primitive (`ImageWidget.ts`'s
 * own working-state controls, `MediaFloatingControls.css`); see
 * `PdfEmbedWidget.css`'s own doc comment for why the working state's
 * reveal semantics differ enough to need its own class. The same shared
 * visual chrome IS reused, verbatim, by this widget's *broken/invalid*
 * state instead, under its own `.cm-invalid-embed__controls`/
 * `.cm-invalid-embed__control` names — see `invalidEmbedCard.ts`.
 * Working-state controls reveal on hover/focus, same as `ImageWidget`'s
 * own controls; the title itself is always visible. Expand opens the
 * existing `PdfOverlay` for this same resource via `getOnPdfEmbedClick` —
 * never a second PDF reader.
 *
 * Page navigation is its own, differently-styled floating pill
 * (`.cm-pdf-embed-pagination`, a dedicated class — not the shared
 * `.cm-media-controls` chrome), centered at the bottom of the page.
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
    // and `mediaPresentation/embedLayout.css`'s own doc comment for the
    // shared global media/embed block-flow contract this class enforces.
    // Deliberately the ONLY class added before branching below —
    // `cm-pdf-embed` is added only inside `renderWorking`, never here: a
    // broken PDF renders through the shared, generic
    // `renderInvalidEmbedCard` component instead (`invalidEmbedCard.ts`),
    // which owns its own `.cm-invalid-embed` identity and must never
    // additionally claim to be a working `.cm-pdf-embed` it isn't — see
    // that module's own doc comment.
    container.classList.add('cm-media-block');
    container.dataset.sourceRevealed = String(this.ui.revealed);

    if (this.ui.broken) {
      return this.renderBroken(container, view);
    }

    return this.renderWorking(container, view);
  }

  private renderBroken(container: HTMLElement, view: EditorView): HTMLElement {
    // Reuses ImageWidget's own broken-card shape via the shared
    // `renderInvalidEmbedCard` component (`invalidEmbedCard.ts`) — no PDF
    // controls, no pagination, no PDF shell: only the icon, delete label,
    // and hint text are PDF-specific. `container` stays generic
    // (`.cm-media-block .cm-invalid-embed`) — never `cm-pdf-embed`, which
    // `toDOM` above deliberately withheld for exactly this branch.
    renderInvalidEmbedCard(container, {
      icon: BROKEN_PDF_ICON,
      source: this.path,
      removeLabel: 'Remove embed',
      onRemove: () => {
        const { from, to } = computeEmbedRemovalRange(view.state, this.pos);
        view.dispatch({ changes: { from, to, insert: '' } });
      },
      editLabel: this.ui.revealed ? 'Hide source' : 'Edit source',
      onEdit: () => {
        const revealing = !this.ui.revealed;
        const to = this.to;
        view.dispatch({
          effects: setImageUiState.of({ pos: this.pos, to, state: { ...this.ui, revealed: revealing } }),
          selection: revealing ? EditorSelection.cursor(to) : undefined,
          scrollIntoView: revealing,
        });
      },
    });

    return container;
  }

  private renderWorking(container: HTMLElement, view: EditorView): HTMLElement {
    // The working-state container identity — added only here, never in
    // `toDOM` before branching; see that method's own doc comment for why.
    container.classList.add('cm-pdf-embed', 'cm-pdf-embed-container');
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
    actionsGroup.classList.add('cm-pdf-controls');
    const moreActionsButton = this.makeButton(MORE_ICON, 'More actions', () => {
      this.getOnOpenPdfMenu()?.({
        anchor: moreActionsButton,
        resourceId: this.resourceId,
        pos: this.pos,
        to: getCurrentTo(),
      });
    });
    const expandButton = this.makeButton(EXPAND_ICON, 'Expand', () => {
      this.getOnPdfEmbedClick()?.(this.path);
    });
    const editButton = this.makeEditButton(view, getCurrentTo);
    // `--mutating` distinguishes the two content-changing controls (Edit
    // source reveals editable raw Markdown; More actions includes
    // archive/move/delete) from Expand (pure viewing, opens PdfOverlay) —
    // Read Mode (MarkdownEditor.css, keyed on `.cm-content[contenteditable
    // ="false"]`) hides only the former, matching the product requirement
    // that viewing affordances stay available while mutation affordances
    // don't.
    editButton.classList.add('cm-pdf-control--mutating');
    moreActionsButton.classList.add('cm-pdf-control--mutating');
    // Expand, then Edit source, then More actions last (far right) — the
    // two direct content-manipulation actions read left-to-right before
    // the catch-all overflow menu.
    actionsGroup.append(expandButton, editButton, moreActionsButton);

    controlsRow.append(titleSpan, actionsGroup);

    // The page-navigation pill — its own dedicated class
    // (`.cm-pdf-embed-pagination`, not the shared `.cm-media-controls`
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

    // Suppresses the `ResizeObserver` callback below for exactly the
    // duration of a corner-handle drag (`pdfResizeHandle.ts`'s own
    // `onResizeStart`/`onResizeEnd` hooks) — without this, dragging the
    // container's width live on every `pointermove` would re-trigger a
    // real PDF.js re-render on every single tick (`pageHost`'s own
    // measured width tracks `container`'s width via ordinary block-flow
    // layout), reproducing exactly the flicker/overlapping-render
    // problem an earlier interactive resize implementation was removed
    // for. See `pdfResizeHandle.ts`'s own doc comment for the full
    // account.
    let suppressFitResize = false;

    // Keeps `availableWidth` live so resizing the editor column
    // recalculates and re-renders the *current* page at the new fit scale
    // (product requirement: resize) — the same `ResizeObserver` role
    // `PdfViewer`'s own effect plays, applied to this widget's own
    // `pageHost` element since no React ref/effect is available inside a
    // CM6 `WidgetType`. Never changes `currentPage` itself.
    const resizeObserver = new ResizeObserver(() => {
      if (suppressFitResize) {
        return;
      }
      const nextWidth = getAvailableViewerWidth(pageHost);
      if (nextWidth === availableWidth) {
        return;
      }
      availableWidth = nextWidth;
      renderCurrentPage();
    });
    resizeObserver.observe(pageHost);

    // Custom drag-to-resize (resize milestone) — replaces the browser's
    // native CSS `resize: horizontal` (MarkdownEditor.css/PdfEmbedWidget.css
    // own doc comments have the full account of why: no reliable native
    // "resize finished" event to persist against). Both bottom-corner
    // handles use the generic `.cm-media-resize-handle--corner-left`/
    // `--corner-right` primitive (MarkdownEditor.css) — the same shared
    // handle Image's own corner handles use, styled once, not duplicated
    // per widget — while `pdfResizeHandle.ts` itself remains a wholly
    // separate, PDF-specific pointer-drag module from
    // `image/imageResizeHandle.ts`. `onResizeEnd` is what makes "the
    // normal PDF rendering/layout system settle to the new width" happen
    // deterministically right when the
    // drag ends, rather than waiting on the `ResizeObserver` above to
    // coincidentally re-fire (it may not, if the live-dragged width
    // already equals the persisted value by the time `updateDOM` re-
    // applies it).
    const pdfResizeHooks = {
      onResizeStart: () => {
        suppressFitResize = true;
      },
      onResizeEnd: () => {
        suppressFitResize = false;
        availableWidth = getAvailableViewerWidth(pageHost);
        renderCurrentPage();
      },
      // Live visual preview during the drag (`pdfResizeHandle.ts`'s own
      // "Live visual responsiveness" doc comment has the full mechanism)
      // — read fresh on every `pointermove`, never captured once:
      // `renderCurrentPage()` replaces this element wholesale on every
      // real render (e.g. mid-drag page navigation, however unlikely),
      // so a stale reference would silently stop working the moment one
      // occurs. `null` while still loading/broken (no page rendered yet
      // to preview) — the drag still resizes the container in that case,
      // just with nothing to visually scale.
      getPageWrap: () => pageHost.querySelector<HTMLElement>('.pdf-viewer__page'),
    };

    const leftHandle = document.createElement('div');
    leftHandle.classList.add('cm-media-resize-handle', 'cm-media-resize-handle--corner-left');
    leftHandle.setAttribute('aria-hidden', 'true');
    attachPdfResizeHandle(leftHandle, container, 'left', view, getCurrentTo, pdfResizeHooks);

    const rightHandle = document.createElement('div');
    rightHandle.classList.add('cm-media-resize-handle', 'cm-media-resize-handle--corner-right');
    rightHandle.setAttribute('aria-hidden', 'true');
    attachPdfResizeHandle(rightHandle, container, 'right', view, getCurrentTo, pdfResizeHooks);

    container.append(leftHandle, rightHandle);

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

  /** Shared dispatch behind the working-state Edit/Hide source control — same reveal-toggle contract `ImageWidget.ts`'s own Edit source establishes (the broken card builds this itself, inline, via `invalidEmbedCard.ts`'s plain `onEdit` callback — see `renderBroken`'s own call site). */
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
   * The working-state floating Edit source control — `renderWorking`'s
   * own live `container.dataset.nodeTo` reader is always passed as
   * `getTo`, since the node's own `to` can shift under a presentation-
   * only `updateDOM` patch (see `ImageWidget.ts`'s equivalent doc comment
   * for the full account of why a captured `this.to` isn't safe there).
   */
  private makeEditButton(view: EditorView, getTo: () => number): HTMLButtonElement {
    return this.makeButton(EDIT_ICON, this.ui.revealed ? 'Hide source' : 'Edit source', () =>
      this.toggleRevealed(view, getTo)
    );
  }

  /** Builds one floating control button using PDF-specific `.cm-pdf-control` class with independent styling. */
  private makeButton(iconHtml: string, label: string, onActivate: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('cm-pdf-control');
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
    button.classList.toggle('cm-pdf-control--disabled', disabled);
  }
}

/** Private symbol keying this widget's own teardown closure onto its root DOM element — see `destroy()`'s own use. */
const PDF_EMBED_DESTROY = Symbol('pdfEmbedDestroy');
