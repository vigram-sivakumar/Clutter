import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Events emitted by the native Go menu (src-tauri/src/app_menu.rs, GO_ACTIONS). */
export const GO_MENU_EVENTS = {
  back: 'menu:go-back',
  forward: 'menu:go-forward',
} as const;

export interface GoMenuActions {
  readonly onBack: () => void;
  readonly onForward: () => void;
}

/**
 * Runs the same history navigation as the top bar's buttons when the native Go menu's Back / Forward (⌘[ / ⌘]) are
 * chosen. They are menu items, as in Safari's History menu, so the system shows and owns the shortcut. The editor does
 * not bind ⌘[ and ⌘] (editorDefaultKeymap.ts), so they work with a note focused too.
 */
export function useNativeGoMenu(actions: GoMenuActions): void {
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const routes: ReadonlyArray<[string, () => void]> = [
      [GO_MENU_EVENTS.back, () => latest.current.onBack()],
      [GO_MENU_EVENTS.forward, () => latest.current.onForward()],
    ];
    // A failed subscription only costs the menu item; the top bar's buttons stay.
    void Promise.all(
      routes.map(async ([event, run]) => {
        try {
          const unlisten = await listen(event, run);
          if (cancelled) unlisten();
          else unlisteners.push(unlisten);
        } catch (error) {
          console.error(`Could not listen for ${event}`, error);
        }
      })
    );
    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}
