import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  fetch: (url: string, init?: RequestInit) => fetchMock(url, init),
}));

describe('downloadRemoteImage', () => {
  beforeEach(() => {
    isTauriMock.mockReset();
    saveMock.mockReset();
    invokeMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    })));
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await expect(downloadRemoteImage('https://example.com/photos/mountain.jpg')).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/photos/mountain.jpg', { signal: expect.any(AbortSignal) });
    expect(invokeMock).toHaveBeenCalledWith(
      'export_write_file',
      new Uint8Array([1, 2, 3]),
      { headers: { ticket: String(TICKET) } }
    );
  });

  it.each([
    ['an HTTP error', () => new Response('<html>missing</html>', { status: 404 }), /404/],
    ['a 204 response', () => new Response(null, { status: 204 }), /empty/],
    ['an empty stream', () => new Response(new Uint8Array()), /empty/],
    ['an oversized response', () => new Response('image', { headers: { 'content-length': String(51 * 1024 * 1024) } }), /too large/],
  ] as const)('preserves the selected destination for %s', async (_label, response, message) => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(TICKET);
    fetchMock.mockResolvedValue(response());
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await expect(downloadRemoteImage('https://example.com/photos/mountain.jpg')).rejects.toThrow(message);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('cancels a chunked response over the export limit without redeeming the ticket', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(TICKET);
    const chunk = new Uint8Array(26 * 1024 * 1024);
    const cancel = vi.fn();
    const pull = vi.fn((stream: ReadableStreamDefaultController<Uint8Array>) => stream.enqueue(chunk));
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 })));
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await expect(downloadRemoteImage('https://example.com/photos/mountain.jpg')).rejects.toThrow(/too large/);
    expect(pull).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('preserves the destination when the response body stalls past the deadline', async () => {
    isTauriMock.mockReturnValue(true);
    saveMock.mockResolvedValue(TICKET);
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal);
    fetchMock.mockImplementation(async () =>
      new Response(new ReadableStream({
        start(body) {
          body.enqueue(new Uint8Array([1]));
          controller.signal.addEventListener('abort', () => body.error('Request cancelled'), { once: true });
          setTimeout(() => controller.abort(), 0);
        },
      }))
    );
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await expect(downloadRemoteImage('https://example.com/photos/mountain.jpg')).rejects.toThrow(/Timed out/);
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('is a no-op in the non-Tauri (browser) runtime', async () => {
    isTauriMock.mockReturnValue(false);
    const { downloadRemoteImage } = await import('./downloadRemoteImage');

    await downloadRemoteImage('https://example.com/photos/mountain.jpg');

    expect(saveMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
