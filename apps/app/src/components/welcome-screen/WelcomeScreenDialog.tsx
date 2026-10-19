import { useState } from 'react';

import type { SpaceAvatarChoice } from '@components/space-avatar/SpaceAvatar';
import { Dialog } from '@components/dialog/Dialog';
import {
  SpaceDetails,
  type CreateFolderResult,
  type NewSpaceDraft,
} from '../space-details/SpaceDetails';
import { WelcomeScreen } from './WelcomeScreen';

interface WelcomeScreenDialogProps {
  /** Native picker. The chosen folder's settings draft, a message when it can't be used, or `null` when cancelled. */
  onSelectFolder: () => Promise<NewSpaceDraft | string | null>;
  /** Where new spaces are created (the user's Documents folder). */
  onResolveSpaceParent: () => Promise<{ path: string; name: string }>;
  onCreateFolder: (name: string) => Promise<CreateFolderResult>;
  /** Open a folder as the space. A message when it failed; `null` when opened. */
  onOpenSpace: (path: string, avatar?: SpaceAvatarChoice) => Promise<string | null>;
  /** Turns an uploaded avatar image's path into a loadable URL for the preview. */
  resolveImageUrl?: (path: string) => string | null;
}

/**
 * First-run onboarding: the WelcomeScreen, and the SpaceDetails it leads to, in one standard Dialog
 * over whatever is mounted behind it. Both screens swap inside the same Overlay — it is never closed
 * and reopened. It has no dismissal of its own (nothing to return to until a Space is open); the
 * caller unmounts it once a Space has opened.
 */
export function WelcomeScreenDialog({
  onSelectFolder,
  onResolveSpaceParent,
  onCreateFolder,
  onOpenSpace,
  resolveImageUrl,
}: WelcomeScreenDialogProps) {
  const [draft, setDraft] = useState<NewSpaceDraft | null>(null);

  async function startNewSpace(): Promise<string | null> {
    try {
      const parent = await onResolveSpaceParent();
      setDraft({ parentPath: parent.path, parentName: parent.name, name: '' });
      return null;
    } catch (error) {
      console.error('Resolving the Documents folder failed:', error);
      return "Couldn't find your Documents folder.";
    }
  }

  async function selectExistingFolder(): Promise<string | null> {
    const picked = await onSelectFolder();
    if (picked === null || typeof picked === 'string') return picked;
    setDraft(picked);
    return null;
  }

  return (
    // The default tinted backdrop is the one scrim over the app frame's background image. It also covers
    // the frame's own drag strip; the overlay's backdrop carries one (its default), so the window moves from
    // the top edge.
    <Dialog open onClose={() => {}} dismissible={false} size="large">
      {draft === null ? (
        <WelcomeScreen onSelectFolder={selectExistingFolder} onCreateSpace={startNewSpace} />
      ) : (
        <SpaceDetails
          draft={draft}
          onNameChange={(name) => setDraft((current) => current && { ...current, name })}
          onAvatarChange={(avatar) => setDraft((current) => current && { ...current, avatar })}
          resolveImageUrl={resolveImageUrl}
          onCreateFolder={onCreateFolder}
          onOpenSpace={onOpenSpace}
          onBack={() => setDraft(null)}
        />
      )}
    </Dialog>
  );
}
