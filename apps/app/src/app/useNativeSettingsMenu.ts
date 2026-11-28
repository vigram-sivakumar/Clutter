import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Emitted by the native Clutter menu's "Settings…" item (src-tauri/src/app_menu.rs). */
export const OPEN_SETTINGS_MENU_EVENT = 'menu:open-settings';

/**
 * Opens the existing Settings dialog when the native "Settings…" menu item (⌘,) is chosen. The dialog stays owned by
 * the shell; this only forwards the request, and ignores it where Settings can't be shown (Welcome, a full-screen
 * error), exactly as the sidebar's own entry point is unavailable there. The listener is stable per mount;
 * read the current availability and handler through a ref, as the other native menu hooks do.
 */
export function useNativeSettingsMenu(available: boolean, openSettings: () => void): void {
  const latest = useRef({ available, openSettings });
  latest.current = { available, openSettings };

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    // A failed subscription only costs the menu shortcut; the dialog stays reachable from the sidebar.
    const subscribe = async () => {
      try {
        const fn = await listen(OPEN_SETTINGS_MENU_EVENT, () => {
          if (!cancelled && latest.current.available) latest.current.openSettings();
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch (error) {
        console.error('Could not listen for the Settings menu item', error);
      }
    };
    void subscribe();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
