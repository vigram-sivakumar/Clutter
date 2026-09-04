/**
 * The available content width of a PDF viewer's scroll container — its
 * `clientWidth` (border-box minus border/scrollbar, per the DOM spec) minus
 * its own left/right padding. This is "the available viewer width" the
 * Fit-Width product requirement refers to: the CSS-pixel width a
 * fit-to-width page should render at. One shared measurement, used by both
 * `PdfViewer` (a real `ResizeObserver`'d React ref, `.pdf-viewer__scroll`)
 * and `PdfEmbedWidget` (a plain DOM element, no React involved — the same
 * `.pdf-viewer__scroll` class, see that widget's own doc comment on why it
 * reuses `PdfViewer`'s CSS contract verbatim) — never two separate fit
 * calculations for the overlay and the embed.
 */
export function getAvailableViewerWidth(container: HTMLElement): number {
  const style = getComputedStyle(container);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  return Math.max(0, container.clientWidth - paddingLeft - paddingRight);
}
