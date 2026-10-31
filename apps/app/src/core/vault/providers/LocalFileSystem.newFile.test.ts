import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauri);
// Every plugin call that could replace a file is a spy: none of them may be reached by a copy or a binary write.
const plugin = vi.hoisted(() => ({
  copyFile: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  writeTextFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  exists: vi.fn(async (_path: string) => false),
  mkdir: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ isDirectory: true })),
}));
vi.mock('@tauri-apps/plugin-fs', () => plugin);

import { LocalVaultProvider } from './LocalFileSystem';
import { DestinationExistsError, MAX_DESTINATION_ATTEMPTS } from './VaultFileSystem';
import { VaultRootMissingError } from './VaultRootMissingError';

const ROOT = '/vault';
const EEXIST = 'EEXIST: destination already exists: /vault/Assets/photo.png';

beforeEach(() => {
  tauri.invoke.mockReset();
  plugin.copyFile.mockClear();
  plugin.writeFile.mockClear();
  plugin.exists.mockReset();
  plugin.exists.mockResolvedValue(false);
});

describe('LocalVaultProvider.copyFile — never replaces', () => {
  it('claims the destination in the native layer, never with the plugin copy (which overwrites)', async () => {
    tauri.invoke.mockResolvedValueOnce(undefined);

    await new LocalVaultProvider(ROOT).copyFile('/Users/me/photo.png', `${ROOT}/Assets/photo.png`);

    expect(tauri.invoke).toHaveBeenCalledWith('copy_file_no_clobber', { from: '/Users/me/photo.png', to: `${ROOT}/Assets/photo.png` });
    expect(plugin.copyFile).not.toHaveBeenCalled();
  });

  it('reports a refused copy as DestinationExistsError naming the destination, and any other failure as it was', async () => {
    const provider = new LocalVaultProvider(ROOT);

    tauri.invoke.mockRejectedValueOnce(EEXIST);
    const refused = await provider.copyFile('/x/photo.png', `${ROOT}/Assets/photo.png`).catch((error) => error);
    expect(refused).toBeInstanceOf(DestinationExistsError);
    expect(refused.destinationPath).toBe(`${ROOT}/Assets/photo.png`);

    tauri.invoke.mockRejectedValueOnce('forbidden path: /x/photo.png');
    await expect(provider.copyFile('/x/photo.png', `${ROOT}/Assets/photo.png`)).rejects.toBe('forbidden path: /x/photo.png');
  });

  it('is refused once the provider is sealed, without reaching the native layer', async () => {
    const provider = new LocalVaultProvider(ROOT);
    provider.seal();

    await expect(provider.copyFile('/x/a.png', `${ROOT}/a.png`)).rejects.toBeInstanceOf(VaultRootMissingError);
    expect(tauri.invoke).not.toHaveBeenCalled();
  });
});

describe('LocalVaultProvider.writeBinaryFile — never replaces', () => {
  it('sends the bytes as the request body and the encoded path as a header, never through the plugin write', async () => {
    tauri.invoke.mockResolvedValueOnce(undefined);
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    await new LocalVaultProvider(ROOT).writeBinaryFile('Assets/My photo #1.png', bytes);

    expect(tauri.invoke).toHaveBeenCalledWith('write_file_no_clobber', bytes, {
      headers: { path: encodeURIComponent(`${ROOT}/Assets/My photo #1.png`) },
    });
    expect(plugin.writeFile).not.toHaveBeenCalled();
  });

  it('reports a refused write as DestinationExistsError, and any other failure as it was', async () => {
    const provider = new LocalVaultProvider(ROOT);

    tauri.invoke.mockRejectedValueOnce(EEXIST);
    await expect(provider.writeBinaryFile(`${ROOT}/Assets/photo.png`, new Uint8Array([1]))).rejects.toBeInstanceOf(
      DestinationExistsError
    );

    tauri.invoke.mockRejectedValueOnce('No space left on device (os error 28)');
    await expect(provider.writeBinaryFile(`${ROOT}/Assets/photo.png`, new Uint8Array([1]))).rejects.toBe(
      'No space left on device (os error 28)'
    );
  });
});

describe('LocalVaultProvider.duplicate (a file) — a name taken after it was chosen is never replaced', () => {
  it('moves on to the next free name when the copy is refused', async () => {
    // `a copy.md` looks free, then another process takes it before the copy lands; `a copy 2.md` is free.
    tauri.invoke.mockRejectedValueOnce('EEXIST: destination already exists: /vault/a copy.md');
    tauri.invoke.mockImplementation(async () => undefined);
    plugin.exists.mockImplementation(async (path: string) => path === `${ROOT}/a copy.md` && tauri.invoke.mock.calls.length > 0);

    const duplicate = await new LocalVaultProvider(ROOT).duplicate(`${ROOT}/a.md`, 'file');

    expect(duplicate).toBe(`${ROOT}/a copy 2.md`);
    expect(tauri.invoke.mock.calls.map((call) => (call[1] as { to: string }).to)).toEqual([`${ROOT}/a copy.md`, `${ROOT}/a copy 2.md`]);
    expect(plugin.copyFile).not.toHaveBeenCalled();
  });

  it('gives up with the refusal itself, never a replacement, when the name keeps being taken', async () => {
    tauri.invoke.mockRejectedValue('EEXIST: destination already exists: /vault/a copy.md');

    await expect(new LocalVaultProvider(ROOT).duplicate(`${ROOT}/a.md`, 'file')).rejects.toBeInstanceOf(DestinationExistsError);

    expect(tauri.invoke).toHaveBeenCalledTimes(MAX_DESTINATION_ATTEMPTS);
    expect(plugin.copyFile).not.toHaveBeenCalled();
  });

  it('does not retry a failure that is not a collision', async () => {
    tauri.invoke.mockRejectedValue('No space left on device (os error 28)');

    await expect(new LocalVaultProvider(ROOT).duplicate(`${ROOT}/a.md`, 'file')).rejects.toBe('No space left on device (os error 28)');

    expect(tauri.invoke).toHaveBeenCalledTimes(1);
  });
});
