import { describe, expect, it, vi, beforeEach } from 'vitest';

const isTauriMock = vi.fn();
const saveMock = vi.fn();
const writeFileMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => isTauriMock(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: (options?: unknown) => saveMock(options),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: (path: string, bytes: Uint8Array) => writeFileMock(path, bytes),
}));

describe('downloadRemoteImage', () => {
  beforeEach(() => {
    isTauriMock.mockReset();
    saveMock.mockReset();
    writeFileMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('opens the native Save dialog defaulted to the URL\'s own filename', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await downloadRemoteImage('https://example.com/photos/mountain.jpg');

    expect(saveMock).toHaveBeenCalledWith({ defaultPath: 'mountain.jpg' });
  });

  it('cancelling the dialog (null) performs no fetch or write', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await downloadRemoteImage('https://example.com/photos/mountain.jpg');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('confirming a destination fetches the URL and writes its bytes there', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue('/Users/me/Downloads/mountain.jpg');
    const bytes = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue({ arrayBuffer: () => Promise.resolve(bytes.buffer) });
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await downloadRemoteImage('https://example.com/photos/mountain.jpg');

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/photos/mountain.jpg');
    expect(writeFileMock).toHaveBeenCalledWith(
      '/Users/me/Downloads/mountain.jpg',
      new Uint8Array([1, 2, 3])
    );
  });

  it('is a no-op in the non-Tauri (browser) runtime', async () => {
    isTauriMock.mockReturnValue(false);
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await downloadRemoteImage('https://example.com/photos/mountain.jpg');

    expect(saveMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
