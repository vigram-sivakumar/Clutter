import { useEffect, useState } from 'react';

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

    async function loadVault() {
      try {
        console.log('Opening vault:', vaultPath);
        const application = await Application.open(vaultPath);
        console.log('Vault opened:', application.vault);

        if (!cancelled) {
          setApplication(application);
        }
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
