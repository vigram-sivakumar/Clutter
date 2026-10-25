import { describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauri);
const plugin = vi.hoisted(() => ({ rename: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/plugin-fs', () => plugin);

import { LocalVaultProvider } from './LocalFileSystem';
import { DestinationExistsError } from './VaultFileSystem';
import { VaultRootMissingError } from './VaultRootMissingError';

const ROOT = '/vault';

describe('LocalVaultProvider.moveFile — noClobber', () => {
  it('claims the destination in the native layer, never with a plain rename', async () => {
    tauri.invoke.mockResolvedValueOnce(undefined);
    plugin.rename.mockClear();

    await new LocalVaultProvider(ROOT).moveFile(`${ROOT}/a.md`, 'Archive/a.md', { noClobber: true });

    expect(tauri.invoke).toHaveBeenCalledWith('move_file_no_clobber', { from: `${ROOT}/a.md`, to: `${ROOT}/Archive/a.md` });
    expect(plugin.rename).not.toHaveBeenCalled();
  });

  it('reports a refused move as DestinationExistsError, and any other failure as it was', async () => {
    const provider = new LocalVaultProvider(ROOT);

    tauri.invoke.mockRejectedValueOnce('EEXIST: destination already exists: /vault/Archive/a.md');
    await expect(provider.moveFile(`${ROOT}/a.md`, `${ROOT}/Archive/a.md`, { noClobber: true })).rejects.toBeInstanceOf(
      DestinationExistsError
    );

    tauri.invoke.mockRejectedValueOnce('No such file or directory (os error 2)');
    await expect(provider.moveFile(`${ROOT}/a.md`, `${ROOT}/Archive/a.md`, { noClobber: true })).rejects.toBe(
      'No such file or directory (os error 2)'
    );
  });

  it('an ordinary move is still a plain rename', async () => {
    plugin.rename.mockClear();
    tauri.invoke.mockClear();

    await new LocalVaultProvider(ROOT).moveFile(`${ROOT}/a.md`, `${ROOT}/b.md`);

    expect(plugin.rename).toHaveBeenCalledWith(`${ROOT}/a.md`, `${ROOT}/b.md`);
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it('is refused once the provider is sealed', async () => {
    const provider = new LocalVaultProvider(ROOT);
    provider.seal();
    tauri.invoke.mockClear();

    await expect(provider.moveFile(`${ROOT}/a.md`, `${ROOT}/b.md`, { noClobber: true })).rejects.toBeInstanceOf(
      VaultRootMissingError
    );
    expect(tauri.invoke).not.toHaveBeenCalled();
  });
});
