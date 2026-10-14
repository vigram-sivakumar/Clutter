import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import { AppIcon } from '@shared/icon';
import type { SelectedSpace } from '../space-details/SpaceDetails';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  onSpaceReady: (space: SelectedSpace) => void;
}

function toMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function WelcomeScreen({ onSpaceReady }: WelcomeScreenProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One action at a time; a cancelled picker (null) changes nothing.
  async function run(action: () => Promise<SelectedSpace | null>) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const space = await action();
      if (space) onSpaceReady(space);
    } catch (error) {
      setError(toMessage(error));
    } finally {
      setIsPending(false);
    }
  }

  // Success closes this window and opens the workspace, so there's no
  // space to hand back — only a cancel or failure leaves us here.
  async function selectFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== 'string') return null;
    await invoke('open_space', { path: picked });
    return null;
  }

  function createSpace() {
    return invoke<SelectedSpace>('create_default_space');
  }

  return (
    <div className="welcome-screen">
      <div className="title-section">
        <span className="welcome__title">Let's create a space</span>
        <span className="welcome__description">
          Bring everything together, and organize your space
          <br />
          just the way you like
        </span>
      </div>
      <div className="space-picker">
        <button
          className="space-picker__button"
          disabled={isPending}
          onClick={() => void run(selectFolder)}
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
          className="space-picker__button"
          disabled={isPending}
          onClick={() => void run(createSpace)}
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
      </div>
      {error && (
        <p className="welcome__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
