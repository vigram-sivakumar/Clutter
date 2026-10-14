import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import { AppIcon } from '@shared/icon';
import {
  DEFAULT_SPACE_NAME,
  type NewSpaceDraft,
} from '../space-details/SpaceDetails';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  onCreateSpace: (draft: NewSpaceDraft) => void;
}

function toMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function WelcomeScreen({ onCreateSpace }: WelcomeScreenProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One action at a time; a cancelled picker (null) changes nothing.
  async function run(action: () => Promise<NewSpaceDraft | null>) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const draft = await action();
      if (draft) onCreateSpace(draft);
    } catch (error) {
      setError(toMessage(error));
    } finally {
      setIsPending(false);
    }
  }

  // Success closes this window and opens the workspace, so there's no
  // draft to hand back — only a cancel or failure leaves us here.
  async function selectFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== 'string') return null;
    await invoke('open_space', { path: picked });
    return null;
  }

  // Nothing is created yet — SpaceDetails collects the name first.
  async function startNewSpace() {
    const parent = await invoke<{ path: string; name: string }>(
      'get_default_space_parent'
    );
    return {
      parentPath: parent.path,
      parentName: parent.name,
      name: DEFAULT_SPACE_NAME,
    };
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
          onClick={() => void run(startNewSpace)}
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
