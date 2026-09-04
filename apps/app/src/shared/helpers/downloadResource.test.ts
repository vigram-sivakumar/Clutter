import { describe, expect, it, vi, beforeEach } from 'vitest';

const isTauriMock = vi.fn();
const saveMock = vi.fn();
const copyFileMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => isTauriMock(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: (options?: unknown) => saveMock(options),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: (source: string, destination: string) => copyFileMock(source, destination),
}));

describe('downloadResource', () => {
  beforeEach(() => {
    isTauriMock.mockReset();
    saveMock.mockReset();
    copyFileMock.mockReset();
  });

  it('opens the native Save dialog defaulted to the resource filename', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadResource } = await import('./downloadResource');

    await downloadResource('/vault/Assets/photo.png', 'photo.png');

    expect(saveMock).toHaveBeenCalledWith({ defaultPath: 'photo.png' });
  });

  it('cancelling the dialog (null) performs no write', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadResource } = await import('./downloadResource');

    await downloadResource('/vault/Assets/photo.png', 'photo.png');

    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it('confirming a destination copies the original bytes from the resource path to the chosen destination', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue('/Users/me/Downloads/photo.png');
    const { downloadResource } = await import('./downloadResource');

    await downloadResource('/vault/Assets/photo.png', 'photo.png');

    expect(copyFileMock).toHaveBeenCalledWith(
      '/vault/Assets/photo.png',
      '/Users/me/Downloads/photo.png'
    );
  });

  it('is a no-op in the non-Tauri (browser) runtime — no dialog, no write', async () => {
    isTauriMock.mockReturnValue(false);
    const { downloadResource } = await import('./downloadResource');

    await downloadResource('/vault/Assets/photo.png', 'photo.png');

    expect(saveMock).not.toHaveBeenCalled();
    expect(copyFileMock).not.toHaveBeenCalled();
  });
});
