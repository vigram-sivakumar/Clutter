import { describe, expect, it, vi, beforeEach } from 'vitest';

const isTauriMock = vi.fn();
const revealItemInDirMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => isTauriMock(),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  revealItemInDir: (path: string) => revealItemInDirMock(path),
}));

describe('revealInFinder', () => {
  beforeEach(() => {
    isTauriMock.mockReset();
    revealItemInDirMock.mockReset();
  });

  it('calls revealItemInDir with the exact absolute path in the Tauri runtime', async () => {
    isTauriMock.mockReturnValue(true);
    const { revealInFinder } = await import('./revealInFinder');

    await revealInFinder('/Users/me/Documents/Clutter/Vault/Assets/image.png');

    expect(revealItemInDirMock).toHaveBeenCalledWith(
      '/Users/me/Documents/Clutter/Vault/Assets/image.png'
    );
  });

  it('is a no-op in the non-Tauri (browser) runtime', async () => {
    isTauriMock.mockReturnValue(false);
    const { revealInFinder } = await import('./revealInFinder');

    await revealInFinder('/Users/me/Documents/Clutter/Vault/Assets/image.png');

    expect(revealItemInDirMock).not.toHaveBeenCalled();
  });
});
