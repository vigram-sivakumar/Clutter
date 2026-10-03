import { beforeEach, describe, expect, it, vi } from 'vitest';

const isTauriMock = vi.fn();
const tauriFetchMock = vi.fn();
const webFetchMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauriMock() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: (url: string) => tauriFetchMock(url) }));

describe('appFetch', () => {
  beforeEach(() => {
    isTauriMock.mockReset();
    tauriFetchMock.mockReset();
    webFetchMock.mockReset();
    vi.stubGlobal('fetch', webFetchMock);
  });

  it('uses the Tauri HTTP plugin in the desktop app (no CORS)', async () => {
    isTauriMock.mockReturnValue(true);
    tauriFetchMock.mockResolvedValue('from-rust');
    const { appFetch } = await import('./appFetch');

    await expect(appFetch('https://example.com/a.png')).resolves.toBe('from-rust');
    expect(webFetchMock).not.toHaveBeenCalled();
  });

  it('uses the web fetch elsewhere', async () => {
    isTauriMock.mockReturnValue(false);
    webFetchMock.mockResolvedValue('from-web');
    const { appFetch } = await import('./appFetch');

    await expect(appFetch('https://example.com/a.png')).resolves.toBe('from-web');
    expect(tauriFetchMock).not.toHaveBeenCalled();
  });
});
