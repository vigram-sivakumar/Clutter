import { isTauri } from '@tauri-apps/api/core';
import { isAtomicWritesEnabled } from '../../featureFlags';
import { createAtomicWriteStack } from '../atomicWrite/createAtomicWriteStack';
import { LocalVaultProvider } from './LocalFileSystem';
import type { VaultFileSystem } from './VaultFileSystem';

/**
 * The filesystem for a short-lived job on a vault outside the open Application: reading or migrating a Space's
 * profile and state when it is renamed or switched to, editing its profile in settings. Those jobs write
 * `.clutter/workspace.json` too, so they must follow the same writer policy as the Application (ADR-063): with
 * atomic saves on they get the atomic provider, never the plain truncating one. A build that asks for atomic saves
 * without the native writer fails these writes loudly (the command does not exist); it does not fall back.
 *
 * The one place outside `Application.bootstrap` that may construct a `LocalVaultProvider`.
 */
export function openVaultFileSystem(rootPath: string): VaultFileSystem {
  const local = new LocalVaultProvider(rootPath);
  if (!isTauri() || !isAtomicWritesEnabled()) return local;

  return createAtomicWriteStack({
    inner: local,
    vaultRoot: rootPath,
    assertWritable: () => local.assertWritable(),
    onDurabilityChange: () => undefined,
  }).fileSystem;
}
