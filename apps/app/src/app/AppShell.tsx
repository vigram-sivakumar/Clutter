import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Application } from '../core/application/Application';

import { AppLayout } from './layouts/app-layout/AppLayout';

export function AppShell() {
  // TODO: Replace with the folder picker.
  const vaultPath = '/Users/sivakuv3/Documents/Personal/Vault';

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let openedApplication: Application | null = null;
    let unlistenCloseRequested: (() => void) | null = null;

    async function loadVault() {
      try {
        const application = await Application.bootstrap(vaultPath);
        await application.open();

        if (cancelled) {
          void application.close();
          return;
        }

        openedApplication = application;
        setApplication(application);

        // Intercept the actual window/app close so dirty content isn't
        // silently lost (autosave-execution-model.md §7) — today, nothing
        // called Application.close() when the user actually quits; this
        // effect's own unmount cleanup below only fires on component
        // unmount, which doesn't correspond to the OS window closing.
        // Application itself stays unaware of the Tauri window API by
        // design (M8's audit) — this handler's only job is triggering the
        // already-existing, already-orderly close() at the right moment,
        // then letting the window actually finish closing.
        unlistenCloseRequested = await getCurrentWindow().onCloseRequested(
          async (event) => {
            event.preventDefault();
            await application.close();
            await getCurrentWindow().destroy();
          }
        );
      } catch (error) {
        console.error('Failed to open vault:', error);
        if (!cancelled) {
          setError(
            error instanceof Error ? error.message : 'Failed to open vault.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadVault();

    return () => {
      cancelled = true;
      unlistenCloseRequested?.();
      void openedApplication?.close();
    };
  }, [vaultPath]);

  if (isLoading) {
    return <div>Loading vault...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!application) {
    return <div>No vault loaded.</div>;
  }

  return <AppLayout application={application} />;
}
