import { createContext, useContext } from 'react';
import type { SpaceAvatarChoice } from '../../components/space-avatar/SpaceAvatar';
import type { SpaceListEntry } from './spaceRegistry';
import type { RenameOutcome } from './renameActiveSpace';
import type { InactiveRenameOutcome } from './renameInactiveSpace';

/** A listed Space: its saved path and name, and the avatar it carries (absent: its initial). */
export type SpaceListItem = SpaceListEntry & {
  /** An image's `src` is an absolute path. */
  readonly avatar?: SpaceAvatarChoice;
  /** The folder is confirmed missing, so the Space can't be opened until it is back. */
  readonly missing?: boolean;
};

export interface SpacesApi {
  readonly spaces: readonly SpaceListItem[];
  readonly activePath: string;
  /** Opens the folder picker and activates the chosen folder; absent where no picker exists (web runtime). */
  readonly onAddSpace?: () => void;
  readonly onSwitchSpace: (path: string) => void;
  /** Turns a Space avatar image's `src` (a file path) into a loadable URL; `null` shows the initial instead. */
  readonly resolveAvatarImageUrl?: (src: string) => string | null;
  /** Forgets a Space's entry in Clutter; its folder and files are never touched. The open Space can't be removed. */
  readonly onRemoveSpace?: (path: string) => void;
  /** Renames the open Space's folder in place (see `renameActiveSpaceFolder`). Absent where there is no local filesystem. */
  readonly onRenameActiveSpace?: (newName: string) => Promise<RenameOutcome>;
  /** Renames the folder of a Space that is NOT open (see `renameInactiveSpaceFolder`); the open Space is untouched. */
  readonly onRenameInactiveSpace?: (path: string, newName: string) => Promise<InactiveRenameOutcome>;
  /** Changes the open Space's avatar (`undefined` removes it); `{ error }` when it could not be saved. */
  readonly onChangeActiveSpaceAvatar?: (avatar: SpaceAvatarChoice | undefined) => Promise<{ error?: string }>;
  /** Changes the avatar of a Space that is NOT open (see `changeInactiveSpaceAvatar`); `{ error }` when nothing was changed. */
  readonly onChangeInactiveSpaceAvatar?: (path: string, avatar: SpaceAvatarChoice | undefined) => Promise<{ error?: string }>;
  /** Recovers a missing Space: the same "Change location" flow as the Space-not-found dialog, for `path`. */
  readonly onChangeMissingSpaceLocation?: (path: string) => void;
  /** Re-checks which listed Spaces still exist; called when the selector opens. */
  readonly refreshAvailability?: () => void;
}

/** Provided by AppShell, which owns the registry; `null` outside it (isolated component tests). */
export const SpacesContext = createContext<SpacesApi | null>(null);

export function useSpaces(): SpacesApi | null {
  return useContext(SpacesContext);
}
