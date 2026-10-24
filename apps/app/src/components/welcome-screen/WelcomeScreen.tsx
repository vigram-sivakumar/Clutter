import { useState } from 'react';
import { useToast } from '../toast/ToastProvider';

import { SettingsEntry } from '@features/settings/settings-entry/SettingsEntry';
import { AppIcon } from '@shared/icon';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  /**
   * "Select a folder": the caller shows the native picker and opens the choice as the space. Resolves a
   * message to show when it could not be opened, or `null` (opened — this screen is about to go — or
   * the picker was cancelled, which changes nothing).
   */
  onSelectFolder: () => Promise<string | null>;
  /** "Create a new space": the caller shows the SpaceDetails screen. Resolves a message if it can't. */
  onCreateSpace: () => Promise<string | null>;
}

export function WelcomeScreen({
  onSelectFolder,
  onCreateSpace,
}: WelcomeScreenProps) {
  const toast = useToast();
  const [isPending, setIsPending] = useState(false);

  // One action at a time. A refusal (the message the action returns) or a failure is shown as a toast; the
  // screen stays so the user can try again or choose the other action.
  async function run(action: () => Promise<string | null>) {
    if (isPending) return;
    setIsPending(true);
    try {
      const refusal = await action();
      if (refusal) {
        toast.fail(refusal);
      }
    } catch (caught) {
      toast.fail('Couldn’t set up the space', caught);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="welcome-screen">
      <div className="title-section">
        <span className="welcome__title">Let’s create a space</span>
        <span className="welcome__description">
          Bring everything together, and organize your space
          <br />
          just the way you like
        </span>
      </div>
      <div className="space-option">
        <SettingsEntry
          title="Select a folder"
          description="Open an existing folder to create a space"
          trailing={
            <span className="icon-badge">
              <AppIcon icon="arrowRight" />
            </span>
          }
          onClick={() => void run(onSelectFolder)}
        />
        <SettingsEntry
          title="Create a new space"
          description="We’ll create a new space for you"
          trailing={
            <span className="icon-badge">
              <AppIcon icon="arrowRight" />
            </span>
          }
          onClick={() => void run(onCreateSpace)}
        />
      </div>
    </div>
  );
}
