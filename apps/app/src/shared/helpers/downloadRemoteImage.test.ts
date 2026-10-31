import { describe, expect, it, vi, beforeEach } from 'vitest';

const isTauriMock = vi.fn();
const saveMock = vi.fn();
const fetchMock = vi.fn();

// The native Save panel (`export_pick_destination`) answers with a single-use ticket, or null when cancelled; the
// other two export commands receive that ticket and never a destination path.
const TICKET = 7;
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => isTauriMock(),
  invoke: (command: string, args?: unknown, options?: unknown) =>
    command === 'export_pick_destination' ? saveMock(args) : invokeMock(command, args, options),
}));


// In the desktop app the download goes through the HTTP plugin (see appFetch).
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (url: string) => fetchMock(url),
}));


describe('downloadRemoteImage', () => {
  beforeEach(() => {
    isTauriMock.mockReset();
    saveMock.mockReset();
    invokeMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('opens the native Save dialog defaulted to the URL\'s own filename', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await downloadRemoteImage('https://example.com/photos/mountain.jpg');

    expect(saveMock).toHaveBeenCalledWith({ defaultName: 'mountain.jpg' });
  });

  it('cancelling the dialog (null) performs no fetch or write', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(null);
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await downloadRemoteImage('https://example.com/photos/mountain.jpg');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('confirming a destination fetches the URL and writes its bytes there', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(TICKET);
    const bytes = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue({ arrayBuffer: () => Promise.resolve(bytes.buffer) });
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await downloadRemoteImage('https://example.com/photos/mountain.jpg');

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/photos/mountain.jpg');
    expect(invokeMock).toHaveBeenCalledWith(
      'export_write_file',
      new Uint8Array([1, 2, 3]),
      { headers: { ticket: String(TICKET) } }
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
