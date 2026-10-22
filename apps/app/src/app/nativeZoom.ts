import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Emitted by the native View menu's zoom items (src-tauri/src/app_menu.rs); the payload is the zoom factor. */
export const ZOOM_CHANGED_EVENT = 'zoom:changed';

/**
 * Publishes the webview's zoom factor as `--app-zoom` on the root (1 at actual size). The native traffic lights do
 * not scale with the zoom, so the controls that sit beside them divide their position and size by this factor to
 * stay level with them (SidebarToggle.css, Page.TopBar.css). Desktop only: the browser has no traffic lights, and
 * leaves the variable at its CSS default of 1.
 */
export function installNativeZoom(): void {
  if (!isTauri()) return;
  // A failed subscription only costs the alignment while zoomed; the app is otherwise unaffected.
  listen<number>(ZOOM_CHANGED_EVENT, ({ payload }) => {
    if (typeof payload !== 'number' || !Number.isFinite(payload) || payload <= 0) return;
    document.documentElement.style.setProperty('--app-zoom', String(payload));
  }).catch((error) => console.error('Could not listen for zoom changes', error));
}
