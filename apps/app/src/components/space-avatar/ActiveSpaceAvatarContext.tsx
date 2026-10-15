import { createContext, useContext } from 'react';
import type { SpaceAvatarProps } from './SpaceAvatar';

/**
 * What a `SpaceAvatar` needs to draw the active Space — its avatar, the folder name its initial
 * comes from, and the image resolver. Provided once by AppShell (which owns the Space), read by every
 * surface that shows the Space root (the folder pickers' root row, the Workspace breadcrumb).
 * `null` outside it, where those surfaces keep their ordinary folder icon.
 */
export const ActiveSpaceAvatarContext = createContext<SpaceAvatarProps | null>(null);

export function useActiveSpaceAvatar(): SpaceAvatarProps | null {
  return useContext(ActiveSpaceAvatarContext);
}
