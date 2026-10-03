import { beforeEach, describe, expect, it, vi } from 'vitest';

const appFetchMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));
vi.mock('@shared/helpers/appFetch', () => ({
  appFetch: (url: string, init?: unknown) => appFetchMock(url, init),
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

const ROOT = '/vault';
const URL_ = 'https://img.example.com/photo/abc.jpg';

const image = () =>
  new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200, headers: { 'content-type': 'image/jpeg' } });

async function setup(files: Record<string, string>) {
  const fileSystem = new InMemoryVaultFileSystem(files);
  await fileSystem.createDirectory(ROOT);
  // The in-memory file system lists only directories that exist explicitly.
  for (const directory of ['Assets', 'Proj', 'Archive']) {
    await fileSystem.createDirectory(`${ROOT}/${directory}`);
  }
  const scan = await new VaultScanner(fileSystem).scan(ROOT);
  const { vault } = new VaultBuilder(new FakeIdGenerator()).build(scan);
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return { application, vault, fileSystem };
}

const files = () => ({
  [`${ROOT}/A.md`]: `---\nid: page-a\ncover: ${URL_}\n---\nIntro ![a](${URL_}) and [a link](${URL_})\n`,
  [`${ROOT}/B.md`]: `---\nid: page-b\n---\nOnly ![b](${URL_}) here\n`,
  [`${ROOT}/Hidden.md`]: `---\nid: page-h\ncover: ${URL_}\ncoverHidden: true\n---\nNo body image\n`,
  [`${ROOT}/Proj/.folder.md`]: `---\nid: folder-c\ncover: ${URL_}\n---\n`,
  [`${ROOT}/Assets/.keep`]: '',
});

describe('Application.saveRemoteImageToVault — real vault', () => {
  beforeEach(() => {
    appFetchMock.mockReset();
    appFetchMock.mockImplementation(async () => image());
  });

  it('saves once, registers the file in the Vault, and rewrites covers + body images; links and hidden covers stay', async () => {
    const { application, vault, fileSystem } = await setup(files());

    const result = await application.saveRemoteImageToVault(URL_);

    // The file exists on disk AND in the Vault (so note images can resolve it).
    expect(await fileSystem.exists(result.assetPath)).toBe(true);
    expect(vault.getResourceByPath(result.assetPath)).toBeDefined();
    expect(result).toMatchObject({ rewritten: 4, failed: [], skippedArchived: 0, skippedHidden: 1, reusedExisting: false });

    const a = await fileSystem.readFile(`${ROOT}/A.md`);
    expect(a).toContain(`cover: ${result.reference}`);
    expect(a).toContain(`![a](${result.reference})`);
    expect(a).toContain(`[a link](${URL_})`); // a plain link is not an image use
    expect(await fileSystem.readFile(`${ROOT}/B.md`)).toContain(`![b](${result.reference})`);
    expect(await fileSystem.readFile(`${ROOT}/Proj/.folder.md`)).toContain(`cover: ${result.reference}`);
    expect(await fileSystem.readFile(`${ROOT}/Hidden.md`)).toContain(`cover: ${URL_}`);
  });

  it('an already-open note reflects the rewrite in its live editor session, and keeps it after navigating away and back', async () => {
    const { application, vault, fileSystem } = await setup(files());
    await application.pageOperations.open('page-b');
    const session = application.pageOperations.getSession('page-b')!;
    expect(session.currentRevision.markdown).toContain(URL_);

    const result = await application.saveRemoteImageToVault(URL_);

    expect(session.currentRevision.markdown).toContain(`![b](${result.reference})`);
    expect(session.currentRevision.markdown).not.toContain(URL_);

    // Let the session's autosave persist, then "navigate away and back" (close + reopen).
    await application.pageOperations.flushAll(2000);
    application.pageOperations.close('page-b');
    await application.pageOperations.open('page-b');

    expect(application.pageOperations.getSession('page-b')!.currentRevision.markdown).toContain(result.reference);
    expect(vault.getPage('page-b')!.source.markdown).toContain(result.reference);
    expect(await fileSystem.readFile(`${ROOT}/B.md`)).toContain(result.reference);
  });

  it('an open note using the image as both cover and body ends with both rewritten, in the editor and on disk', async () => {
    const { application, vault, fileSystem } = await setup(files());
    await application.pageOperations.open('page-a');
    const session = application.pageOperations.getSession('page-a')!;

    const result = await application.saveRemoteImageToVault(URL_);
    await application.pageOperations.flushAll(2000);

    expect(session.currentRevision.markdown).toContain(`![a](${result.reference})`);
    expect(vault.getPage('page-a')!.metadata.cover).toBe(result.reference);
    const onDisk = await fileSystem.readFile(`${ROOT}/A.md`);
    expect(onDisk).toContain(`cover: ${result.reference}`);
    expect(onDisk).toContain(`![a](${result.reference})`);
    expect(onDisk).not.toContain(`![a](${URL_})`);
  });

  it('the Assets catalog moves from one remote asset to one local asset carrying every use', async () => {
    const { application } = await setup(files());
    const remote = () => application.membershipSelector.getAllAssets().filter((a) => a.source === 'remote');
    expect(remote()).toHaveLength(1);

    const result = await application.saveRemoteImageToVault(URL_);

    const assets = application.membershipSelector.getAllAssets();
    expect(assets.filter((a) => a.source === 'remote')).toHaveLength(0);
    const local = assets.filter((a) => a.source === 'local' && a.resource.path === result.assetPath);
    expect(local).toHaveLength(1);
    expect(local[0]!.references.map((r) => `${r.usage}:${r.referrer.id}`).sort()).toEqual(
      ['cover:folder-c', 'cover:page-a', 'embed:page-a', 'embed:page-b'].sort()
    );
  });

  it('concurrent clicks share one download and one rewrite', async () => {
    const { application } = await setup(files());

    const first = application.saveRemoteImageToVault(URL_);
    const second = application.saveRemoteImageToVault(URL_);
    const third = application.saveRemoteImageToVault(URL_);

    expect(second).toBe(first);
    expect(third).toBe(first);
    await first;
    expect(appFetchMock).toHaveBeenCalledTimes(1);
  });

  it('clicking again after success reuses the saved file and has nothing left to rewrite', async () => {
    const { application, fileSystem } = await setup(files());
    const first = await application.saveRemoteImageToVault(URL_);

    const again = await application.saveRemoteImageToVault(URL_);

    expect(again).toMatchObject({ reusedExisting: true, rewritten: 0, reference: first.reference });
    expect(appFetchMock).toHaveBeenCalledTimes(1);
    expect((await fileSystem.readDirectory(`${ROOT}/Assets`)).filter((e) => e.name.endsWith('.jpg'))).toHaveLength(1);
  });

  it.each([
    ['a 404', () => new Response('nope', { status: 404 })],
    ['a 403', () => new Response('nope', { status: 403 })],
    ['an HTML page', () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })],
  ])('%s changes nothing: no file, no rewritten note', async (_name, response) => {
    appFetchMock.mockImplementation(async () => response());
    const { application, fileSystem } = await setup(files());
    const before = await fileSystem.readFile(`${ROOT}/A.md`);

    await expect(application.saveRemoteImageToVault(URL_)).rejects.toThrow();

    expect(await fileSystem.readFile(`${ROOT}/A.md`)).toBe(before);
    expect((await fileSystem.readDirectory(`${ROOT}/Assets`)).filter((e) => e.name.endsWith('.jpg'))).toHaveLength(0);
  });

  it('a network failure changes nothing, and a later retry can succeed', async () => {
    appFetchMock.mockRejectedValueOnce(new TypeError('Load failed'));
    const { application, fileSystem } = await setup(files());

    await expect(application.saveRemoteImageToVault(URL_)).rejects.toThrow(/Load failed/);
    expect(await fileSystem.readFile(`${ROOT}/B.md`)).toContain(URL_);

    const retry = await application.saveRemoteImageToVault(URL_);
    expect(retry.rewritten).toBeGreaterThan(0);
  });

  it('an archived note is left alone and counted', async () => {
    const { application, fileSystem } = await setup({
      ...files(),
      [`${ROOT}/Archive/Old.md`]: `---\nid: page-old\nstatus: archived\n---\nOld ![o](${URL_})\n`,
    });

    const result = await application.saveRemoteImageToVault(URL_);

    expect(result.skippedArchived).toBeGreaterThanOrEqual(1);
    expect(await fileSystem.readFile(`${ROOT}/Archive/Old.md`)).toContain(URL_);
  });
});
