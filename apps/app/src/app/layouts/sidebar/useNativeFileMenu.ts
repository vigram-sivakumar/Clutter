import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Events emitted by the native File menu (src-tauri/src/app_menu.rs, FILE_ACTIONS). */
export const FILE_MENU_EVENTS = {
  newNote: 'menu:new-note',
  newDailyNote: 'menu:new-daily-note',
  newFolder: 'menu:new-folder',
} as const;

export interface FileMenuActions {
  readonly onNewNote: () => void;
  readonly onNewDailyNote: () => void;
  readonly onNewFolder: () => void;
}

/**
 * Runs the sidebar's own create handlers when the native File menu items are chosen, so the menu and the Create menu
 * share one implementation. Handlers are read through a ref, so the subscription is made once per mount.
 */
export function useNativeFileMenu(actions: FileMenuActions): void {
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const routes: ReadonlyArray<[string, () => void]> = [
      [FILE_MENU_EVENTS.newNote, () => latest.current.onNewNote()],
      [FILE_MENU_EVENTS.newDailyNote, () => latest.current.onNewDailyNote()],
      [FILE_MENU_EVENTS.newFolder, () => latest.current.onNewFolder()],
    ];
    // A failed subscription only costs the menu item; the same actions stay reachable from the sidebar.
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
