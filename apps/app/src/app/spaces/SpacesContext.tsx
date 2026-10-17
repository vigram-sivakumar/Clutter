import { createContext, useContext } from 'react';
import type { SpaceListEntry } from './spaceRegistry';

export interface SpacesApi {
  readonly spaces: readonly SpaceListEntry[];
  readonly activePath: string;
  /** Opens the folder picker and activates the chosen folder; absent where no picker exists (web runtime). */
  readonly onAddSpace?: () => void;
  readonly onSwitchSpace: (path: string) => void;
  /** Re-checks which listed Spaces still exist; called when the selector opens. */
  readonly refreshAvailability?: () => void;
}

/** Provided by AppShell, which owns the registry; `null` outside it (isolated component tests). */
export const SpacesContext = createContext<SpacesApi | null>(null);

export function useSpaces(): SpacesApi | null {
  return useContext(SpacesContext);
}
