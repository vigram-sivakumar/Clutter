import { beforeEach, describe, expect, it, vi } from 'vitest';

const appFetchMock = vi.fn();
const trackMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));
vi.mock('@shared/helpers/appFetch', () => ({
  appFetch: (url: string, init?: unknown) => appFetchMock(url, init),
}));
vi.mock('../integrations/unsplash/UnsplashApi', () => ({
  trackPhotoDownload: (location: string) => trackMock(location),
}));

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { FakeIdGenerator } from '../vault/testing/FakeIdGenerator';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { VaultScanner } from '../vault/ingest/VaultScanner';
import { VaultBuilder } from '../vault/ingest/VaultBuilder';
import { coverAttributionFor } from '../integrations/unsplash/unsplashAttribution';

const ROOT = '/vault';
const PHOTO = 'https://images.unsplash.com/photo-a?ixid=1&w=1080';
const DOWNLOAD = 'https://api.unsplash.com/photos/p1/download?ixid=abc';
const CREDIT_LINE = `Alex Doe <https://unsplash.com/@alex> <${DOWNLOAD}>`;

const image = () =>
  new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200, headers: { 'content-type': 'image/jpeg' } });

async function setup(files: Record<string, string>) {
  const fileSystem = new InMemoryVaultFileSystem(files);
  await fileSystem.createDirectory(ROOT);
  for (const directory of ['Assets', 'Archive']) {
    await fileSystem.createDirectory(`${ROOT}/${directory}`);
  }
  const scan = await new VaultScanner(fileSystem).scan(ROOT);
  const { vault } = new VaultBuilder(new FakeIdGenerator()).build(scan);
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return { application, vault, fileSystem };
}

const credited = () => ({
  [`${ROOT}/A.md`]: `---\nid: page-a\ncover: ${PHOTO}\ncoverCredit: ${CREDIT_LINE}\n---\nBody\n`,
  [`${ROOT}/Assets/.keep`]: '',
});

describe('Save to vault for an Unsplash photo — an explicit, user-requested save (ADR-054)', () => {
  beforeEach(() => {
    appFetchMock.mockReset();
    appFetchMock.mockImplementation(async () => image());
    trackMock.mockReset();
    trackMock.mockResolvedValue(true);
  });

  it('saves the file only when asked, reports exactly one download with the exact download_location, and keeps the credit', async () => {
    const { application, vault, fileSystem } = await setup(credited());

    // Nothing is downloaded or reported until the user asks.
    expect(appFetchMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();

    const result = await application.saveRemoteImageToVault(PHOTO);

    expect(appFetchMock).toHaveBeenCalledTimes(1);
    expect(await fileSystem.exists(result.assetPath)).toBe(true);
    expect(result.assetPath.startsWith(`${ROOT}/Assets/`)).toBe(true);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(DOWNLOAD);

    const page = vault.getPage('page-a')!;
    expect(page.metadata.cover).toBe(result.reference);
    expect(page.metadata.coverCredit).toEqual({
      name: 'Alex Doe',
      url: 'https://unsplash.com/@alex',
      downloadLocation: DOWNLOAD,
    });
    expect(await fileSystem.readFile(`${ROOT}/A.md`)).toContain(`coverCredit: ${CREDIT_LINE}`);
    // The saved local file is still credited on screen.
    expect(coverAttributionFor(page.metadata.cover, page.metadata.coverCredit)).toMatchObject({
      kind: 'credit',
      name: 'Alex Doe',
    });
  });

  it('does not report a download when the save fails (nothing was saved)', async () => {
    appFetchMock.mockRejectedValue(new Error('offline'));
    const { application, vault } = await setup(credited());

    await expect(application.saveRemoteImageToVault(PHOTO)).rejects.toThrow();

    expect(trackMock).not.toHaveBeenCalled();
    expect(vault.getPage('page-a')!.metadata.cover).toBe(PHOTO);
  });

  it('still saves when the tracking request is rejected by Unsplash', async () => {
    trackMock.mockResolvedValue(false);
    const { application, vault } = await setup(credited());

    const result = await application.saveRemoteImageToVault(PHOTO);

    expect(vault.getPage('page-a')!.metadata.cover).toBe(result.reference);
  });

  it('a photo with no recorded download location still saves on request — there is simply nothing to report', async () => {
    const { application, vault } = await setup({
      [`${ROOT}/Old.md`]: `---\nid: page-o\ncover: ${PHOTO}\n---\nBody\n`,
      [`${ROOT}/Assets/.keep`]: '',
    });

    const result = await application.saveRemoteImageToVault(PHOTO);

    expect(vault.getPage('page-o')!.metadata.cover).toBe(result.reference);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('the Download action reports through the same call: once per call, exact location, only for a known Unsplash photo', async () => {
    const { application } = await setup(credited());

    application.reportUnsplashDownload(PHOTO);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenLastCalledWith(DOWNLOAD);

    application.reportUnsplashDownload('https://images.unsplash.com/photo-unknown?ixid=9');
    application.reportUnsplashDownload('https://img.example.com/photo/abc.jpg');
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('non-Unsplash remote images save exactly as before, with no Unsplash request', async () => {
    const other = 'https://img.example.com/photo/abc.jpg';
    const { application, vault } = await setup({
      [`${ROOT}/B.md`]: `---\nid: page-b\ncover: ${other}\n---\nBody\n`,
      [`${ROOT}/Assets/.keep`]: '',
    });

    const result = await application.saveRemoteImageToVault(other);

    expect(vault.getPage('page-b')!.metadata.cover).toBe(result.reference);
    expect(trackMock).not.toHaveBeenCalled();
  });
});
