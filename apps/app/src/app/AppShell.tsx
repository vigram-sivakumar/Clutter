import { useEffect, useState } from 'react';

import { AppLayout } from './layouts/app-layout/AppLayout';

import { Vault } from '../core/vault/models';
import { LocalVaultProvider } from '../core/vault/providers';
import { VaultBuilder, VaultScanner } from '../core/vault/services';

export function AppShell() {
  // TODO: Replace with the folder picker.
  const vaultPath = '/Users/sivakuv3/Documents/Personal/Vault';

  const [vault, setVault] = useState<Vault | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadVault() {
      try {
        console.log('Opening vault:', vaultPath);
        const fileSystem = new LocalVaultProvider();

        const scanner = new VaultScanner(fileSystem);
        console.log('Scanning vault...');
        const builder = new VaultBuilder();

        const scanResult = await scanner.scan(vaultPath);
        console.log('Scan result:', scanResult);
        console.log('Building vault...');
        const vault = builder.build(scanResult);
        console.log('Vault built:', vault);

        if (!cancelled) {
          setVault(vault);
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

  if (!vault) {
    return <div>No vault loaded.</div>;
  }

  return <AppLayout vault={vault} />;
}
