/**
 * Production builds only (`import.meta.env.PROD`): development keeps the native menu everywhere, so Reload and
 * Inspect Element stay one right-click away. Returns the cleanup (a no-op in development).
 */
export function installNativeContextMenuPolicy(
  isProduction: boolean = import.meta.env.PROD,
  target: Document = document
): () => void {
  return isProduction ? suppressNativeContextMenu(target) : () => {};
}

/**
 * Clutter draws its own context menus; the WebView's native one (Reload, Inspect Element…) never belongs in
 * the desktop app. One listener on the document, in the bubble phase, so every right-click anywhere in the
 * window — blank space, the sidebar, the editor, page margins, the area around an open menu — ends here with
 * the native menu suppressed.
 *
 * It only calls `preventDefault()`: it never stops propagation, and being last in the bubble phase it runs
 * after the custom handlers (a row or card opening its menu) have had the event. An overlay that is open
 * handles the event earlier still, in the capture phase (`Overlay`), dismissing itself.
 *
 * Returns the cleanup, for tests.
 */
export function suppressNativeContextMenu(target: Document = document): () => void {
  const handler = (event: Event) => event.preventDefault();
  target.addEventListener('contextmenu', handler);
  return () => target.removeEventListener('contextmenu', handler);
}
