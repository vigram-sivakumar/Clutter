import { useEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Emitted by the native Edit menu's "Copy Link to Current Page" (src-tauri/src/app_menu.rs). */
export const COPY_PAGE_LINK_MENU_EVENT = 'menu:copy-page-link';

/**
 * Wires the native Edit menu's "Copy Link to Current Page". The item is enabled only while `hasPage` is true, and
 * choosing it runs `onCopyPageLink` — the same "Copy path → As Markdown" action the page's own menus use, so no link or
 * clipboard logic lives here. Read through a ref so the subscription is made once per mount.
 */
export function useNativeEditMenu(hasPage: boolean, onCopyPageLink: () => void): void {
  const latest = useRef(onCopyPageLink);
  latest.current = onCopyPageLink;

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    // A failed subscription only costs the menu item; the same action stays reachable from the page's menu.
    void listen(COPY_PAGE_LINK_MENU_EVENT, () => latest.current())
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error) => console.error('Could not listen for the Copy Link menu item', error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke('set_copy_page_link_enabled', { enabled: hasPage }).catch((error) =>
      console.error('Could not update the Copy Link menu item', error)
    );
  }, [hasPage]);

  // Nothing is open once this shell is gone (a Space closing, the Welcome screen), so the item must not stay enabled.
  useEffect(() => {
    if (!isTauri()) return;
    return () => {
      void invoke('set_copy_page_link_enabled', { enabled: false }).catch(() => undefined);
    };
  }, []);
}
