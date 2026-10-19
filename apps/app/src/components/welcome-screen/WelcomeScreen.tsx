import { useState } from 'react';

import { AppIcon } from '@shared/icon';
import { useRejectShake } from '../property-list/useRejectShake';
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
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectShake = useRejectShake();
  const createShake = useRejectShake();

  // One action at a time. A failure shakes the button that was clicked and says why below the
  // buttons; the screen stays so the user can try again or choose the other action.
  async function run(
    action: () => Promise<string | null>,
    shake: () => void
  ) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const message = await action();
      if (message !== null) {
        setError(message);
        shake();
      }
    } catch (caught) {
      console.error('Welcome screen action failed:', caught);
      setError('Something went wrong. Try again');
      shake();
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
      <div className="space-picker">
        <button
          className={['space-picker__button', selectShake.shakeClassName]
            .filter(Boolean)
            .join(' ')}
          onClick={() => void run(onSelectFolder, selectShake.shake)}
        >
          <div className="space-picker__button--content">
            <span className="space-picker__title">Select a folder</span>
            <span className="space-picker__description">
              Open an existing folder to create a space
            </span>
          </div>
          <span className="space-picker__icon">
            <AppIcon icon="arrowRight" />
          </span>
        </button>
        <div className="space-picker__divider" aria-hidden="true">
          <span className="space-picker__divider-rule" />
          <span className="space-picker__divider-text">or</span>
          <span className="space-picker__divider-rule" />
        </div>
        <button
          className={['space-picker__button', createShake.shakeClassName]
            .filter(Boolean)
            .join(' ')}
          onClick={() => void run(onCreateSpace, createShake.shake)}
        >
          <div className="space-picker__button--content">
            <span className="space-picker__title">Create a new space</span>
            <span className="space-picker__description">
              We’ll create a new space for you
            </span>
          </div>
          <span className="space-picker__icon">
            <AppIcon icon="arrowRight" />
          </span>
        </button>
        {error && (
          <span className="space-picker__error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
