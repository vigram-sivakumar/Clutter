import { createContext, useContext } from 'react';

/** Where a row was right-clicked, and which right-click it was (so one request is handled once). */
export interface RowContextMenuRequest {
  readonly x: number;
  readonly y: number;
  readonly seq: number;
}

/**
 * What an `Entry` row offers the More actions menu rendered inside it: a way to say "I have a menu", and the
 * latest right-click on the row. The menu (`OverflowMenu`) is the one that opens itself at the point — through
 * its own `onOpenChange`, the same state its button drives — so the row never reaches into the menu's button.
 */
export interface EntryMenuApi {
  register(): () => void;
  readonly request: RowContextMenuRequest | null;
}

export const EntryMenuContext = createContext<EntryMenuApi | null>(null);

/**
 * Whether rows below are right-clickable into their More actions menu. Provided by the Sidebar around its
 * rows; everywhere else (page property rows, pickers) `Entry` keeps the platform's own behavior.
 */
export const RowContextMenuEnabledContext = createContext(false);
export const RowContextMenuEnabled = RowContextMenuEnabledContext.Provider;

export function useEntryMenu(): EntryMenuApi | null {
  return useContext(EntryMenuContext);
}
