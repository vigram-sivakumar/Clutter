// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isTauri, readFile, fetchRemoteAsset } = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  readFile: vi.fn(),
  fetchRemoteAsset: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readFile }));
vi.mock('@core/vault/providers/fetchRemoteAsset', () => ({ fetchRemoteAsset }));

import { loadCoverImageBytes } from './coverImageBytes';

const vault = { root: '/Users/me/Vault', loadableUrl: (absolutePath: string) => `asset://localhost${absolutePath}` };

beforeEach(() => {
  isTauri.mockReturnValue(true);
  readFile.mockReset();
  fetchRemoteAsset.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe('loadCoverImageBytes', () => {
  it('fetches a remote cover from its stored URL, query parameters intact', async () => {
    const bytes = new Uint8Array([1]);
    fetchRemoteAsset.mockResolvedValue({ bytes, contentType: 'image/jpeg' });

    const url = 'https://images.unsplash.com/photo-1?ixid=abc&q=80&w=4800';

    expect(await loadCoverImageBytes(url, vault)).toEqual({ bytes, contentType: 'image/jpeg' });
    expect(fetchRemoteAsset).toHaveBeenCalledWith(url);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reads a vault-relative cover from its file in the vault, in the desktop app', async () => {
    const bytes = new Uint8Array([2]);
    readFile.mockResolvedValue(bytes);

    expect(await loadCoverImageBytes('Assets/mountain.png', vault)).toEqual({ bytes });
    expect(readFile).toHaveBeenCalledWith('/Users/me/Vault/Assets/mountain.png');
    expect(fetchRemoteAsset).not.toHaveBeenCalled();
  });

  it('reads it from the address the page displays it with where there is no file access (the web runtime)', async () => {
    isTauri.mockReturnValue(false);
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([3]).buffer }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await loadCoverImageBytes('Assets/a.png', vault)).toEqual({ bytes: new Uint8Array([3]) });
    expect(fetchMock).toHaveBeenCalledWith('asset://localhost/Users/me/Vault/Assets/a.png');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('rejects when the file cannot be read, so nothing is copied', async () => {
    readFile.mockRejectedValue(new Error('forbidden path'));

    await expect(loadCoverImageBytes('Assets/mountain.png', vault)).rejects.toThrow('forbidden path');
  });
});
