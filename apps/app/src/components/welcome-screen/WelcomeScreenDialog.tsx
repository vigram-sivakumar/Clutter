import { useState } from 'react';

import { Dialog } from '@components/dialog/Dialog';
import {
  SpaceDetails,
  type CreateFolderResult,
  type NewSpaceDraft,
} from '../space-details/SpaceDetails';
import { WelcomeScreen } from './WelcomeScreen';

interface WelcomeScreenDialogProps {
  /** Native picker, then open the chosen folder. A message when it failed; `null` when opened or cancelled. */
  onSelectFolder: () => Promise<string | null>;
  /** Where new spaces are created (the user's Documents folder). */
  onResolveSpaceParent: () => Promise<{ path: string; name: string }>;
  onCreateFolder: (name: string) => Promise<CreateFolderResult>;
  /** Open a folder as the space. A message when it failed; `null` when opened. */
  onOpenSpace: (path: string) => Promise<string | null>;
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

  return (
    // The default tinted backdrop is the one scrim over the app frame's background image.
    <Dialog open onClose={() => {}} dismissible={false} size="large">
      {/* Both screens fill their parent's height, so it is given a fixed one. */}
      <div style={{ height: 480 }}>
        {draft === null ? (
          <WelcomeScreen onSelectFolder={onSelectFolder} onCreateSpace={startNewSpace} />
        ) : (
          <SpaceDetails
            draft={draft}
            onNameChange={(name) => setDraft((current) => current && { ...current, name })}
            onCreateFolder={onCreateFolder}
            onOpenSpace={onOpenSpace}
            onBack={() => setDraft(null)}
          />
        )}
      </div>
    </Dialog>
  );
}
