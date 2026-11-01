import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  copyFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));

import { DestinationExistsError } from './VaultFileSystem';
import { LocalVaultProvider } from './LocalFileSystem';

beforeEach(() => invoke.mockReset());

// Opening a vault no longer creates its root (see Application.missingRoot.test.ts), but explicit
// creation — a future "Create new vault", `.clutter`, Assets — still goes through this primitive.
describe('LocalVaultProvider.createDirectory (explicit creation)', () => {
  it('still creates the directory recursively', async () => {
    invoke.mockResolvedValue(undefined);
    await new LocalVaultProvider('/v').createDirectory('/v/New Vault');
    expect(invoke).toHaveBeenCalledWith('create_directory', { path: '/v/New Vault', recursive: true });
  });

  it('resolves a relative path under the root', async () => {
    invoke.mockResolvedValue(undefined);
    await new LocalVaultProvider('/v').createDirectory('.clutter');
    expect(invoke).toHaveBeenCalledWith('create_directory', { path: '/v/.clutter', recursive: true });
  });

  it('the exclusive form asks the native command for a new folder only, and a name that exists is a DestinationExistsError', async () => {
    invoke.mockRejectedValueOnce('File exists (os error 17)');
    const provider = new LocalVaultProvider('/v');

    await expect(provider.createDirectory('/v/Taken', { exclusive: true })).rejects.toBeInstanceOf(DestinationExistsError);
    expect(invoke).toHaveBeenCalledWith('create_directory', { path: '/v/Taken', recursive: false });
  });

  it('a path the native command refuses (outside the Space, or through a link that leaves it) is an error, not a silent success', async () => {
    invoke.mockRejectedValueOnce('forbidden path: /v/link/made');

    await expect(new LocalVaultProvider('/v').createDirectory('/v/link/made')).rejects.toBe('forbidden path: /v/link/made');
  });
});

describe('LocalVaultProvider.deleteFile', () => {
  it('goes through the native delete_path command, never the fs plugin, recursively only when asked', async () => {
    invoke.mockResolvedValue(undefined);
    const provider = new LocalVaultProvider('/v');

    await provider.deleteFile('/v/a.md');
    await provider.deleteFile('/v/Folder', { recursive: true });

    expect(invoke).toHaveBeenNthCalledWith(1, 'delete_path', { path: '/v/a.md', recursive: false });
    expect(invoke).toHaveBeenNthCalledWith(2, 'delete_path', { path: '/v/Folder', recursive: true });
  });

  it('a refusal reaches the caller and nothing else is attempted', async () => {
    invoke.mockRejectedValueOnce('forbidden path: /v/exit/victim.md');

    await expect(new LocalVaultProvider('/v').deleteFile('/v/exit/victim.md')).rejects.toBe('forbidden path: /v/exit/victim.md');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

});
