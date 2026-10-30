// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { ToastProvider } from '@components/toast/ToastProvider';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';
import type { VaultResource } from '@core/vault/models/VaultResource';

const { downloadRemoteImage, downloadResource, fetchRemoteAsset } = vi.hoisted(() => ({
  downloadRemoteImage: vi.fn(async () => {}),
  downloadResource: vi.fn(async () => {}),
  fetchRemoteAsset: vi.fn(),
}));

// A vault path becomes a loadable URL through Tauri's convertFileSrc, which jsdom has no runtime for.
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}));
vi.mock('@shared/helpers/downloadRemoteImage', () => ({ downloadRemoteImage }));
vi.mock('@shared/helpers/downloadResource', () => ({ downloadResource }));
vi.mock('@core/vault/providers/fetchRemoteAsset', () => ({ fetchRemoteAsset }));

/**
 * The cover menu's file actions, end to end through the real AppLayout composition (PageHost ->
 * Page -> PageCover): Download for any cover, Save to vault only for one that is a URL, each
 * reaching the same handler the asset menu uses.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  downloadRemoteImage.mockClear();
  downloadResource.mockClear();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function buildNoteWithBody(markdown: string): Page {
  const builder = new PageBuilder(ROOT);
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: markdown,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function buildNoteWithCover(cover: string, coverCredit?: { name: string; url: string; downloadLocation?: string }): Page {
  const builder = new PageBuilder(ROOT);
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1', cover, coverCredit },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

// A vault-local cover is drawn only while the Vault holds its file, so a test of a cover "in the vault"
// has to put the file there.
function vaultImage(cover: string): VaultResource {
  return { id: `resource-${cover}`, kind: 'image', name: cover.slice(cover.lastIndexOf('/') + 1), path: `${ROOT}/${cover}`, parentId: null };
}

function makeApplication(pages: Page[], resources: VaultResource[] = []): Application {
  const vault = new Vault(
    ROOT,
    pages,
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  // bootstrap() sets this in the app; a vault-local reference resolves against it.
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function openCoverMenu(
  cover: string,
  coverCredit?: { name: string; url: string; downloadLocation?: string }
): Promise<Application> {
  const page = buildNoteWithCover(cover, coverCredit);
  const isUrl = /^https?:\/\//.test(cover);
  const application = makeApplication([page], isUrl ? [] : [vaultImage(cover)]);
  await application.pageOperations.open(page.id);

  render(
    <ToastProvider>
      <AppLayout application={application} />
    </ToastProvider>
  );
  await flush();

  const trigger = document.querySelector<HTMLButtonElement>('.page__cover__menu');
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger!);
  return application;
}

describe('PageHost: cover image file actions', () => {
  it('a remote cover offers Save to vault and Download', async () => {
    await openCoverMenu('https://example.com/photos/mountain.png');

    expect(screen.getByText('Save to vault')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('Save to vault on a remote cover runs the same save-to-vault flow with that URL', async () => {
    const url = 'https://example.com/photos/mountain.png';
    const page = buildNoteWithCover(url);
    const application = makeApplication([page]);
    const save = vi
      .spyOn(application, 'saveRemoteImageToVault')
      .mockResolvedValue({ outcome: 'saved' } as never);
    await application.pageOperations.open(page.id);
    render(<AppLayout application={application} />);
    await flush();
    fireEvent.click(document.querySelector<HTMLButtonElement>('.page__cover__menu')!);

    fireEvent.click(screen.getByText('Save to vault'));

    await waitFor(() => expect(save).toHaveBeenCalledWith(url));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('Download on a remote cover downloads that URL', async () => {
    await openCoverMenu('https://example.com/photos/mountain.png');

    fireEvent.click(screen.getByText('Download'));

    expect(downloadRemoteImage).toHaveBeenCalledWith('https://example.com/photos/mountain.png');
    expect(downloadResource).not.toHaveBeenCalled();
  });

  describe('an Unsplash cover (user-requested downloads are reported to Unsplash, ADR-054)', () => {
    const photo = 'https://images.unsplash.com/photo-a?ixid=1&w=1080';
    const credit = {
      name: 'Alex Doe',
      url: 'https://unsplash.com/@alex',
      downloadLocation: 'https://api.unsplash.com/photos/p1/download?ixid=abc',
    };

    it('still offers Save to vault and Download', async () => {
      await openCoverMenu(photo, credit);

      expect(screen.getByText('Save to vault')).toBeInTheDocument();
      expect(screen.getByText('Download')).toBeInTheDocument();
    });

    it('Download reports the photo to Unsplash once the file was written — and not when it was cancelled', async () => {
      const application = await openCoverMenu(photo, credit);
      const report = vi.spyOn(application, 'reportUnsplashDownload');

      downloadRemoteImage.mockResolvedValueOnce(false as never);
      fireEvent.click(screen.getByText('Download'));
      await flush();
      expect(report).not.toHaveBeenCalled();

      fireEvent.click(document.querySelector<HTMLButtonElement>('.page__cover__menu')!);
      downloadRemoteImage.mockResolvedValueOnce(true as never);
      fireEvent.click(screen.getByText('Download'));
      await flush();

      expect(downloadRemoteImage).toHaveBeenCalledWith(photo);
      expect(report).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledWith(photo);
    });

    it('Save to vault runs the one save pipeline for the photo URL (which reports the download itself)', async () => {
      const page = buildNoteWithCover(photo, credit);
      const application = makeApplication([page]);
      const save = vi.spyOn(application, 'saveRemoteImageToVault').mockResolvedValue({ outcome: 'saved' } as never);
      await application.pageOperations.open(page.id);
      render(<AppLayout application={application} />);
      await flush();
      fireEvent.click(document.querySelector<HTMLButtonElement>('.page__cover__menu')!);

      fireEvent.click(screen.getByText('Save to vault'));

      await waitFor(() => expect(save).toHaveBeenCalledWith(photo));
    });
  });

  it('a cover already in the vault offers Download only', async () => {
    await openCoverMenu('Assets/mountain.png');

    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.queryByText('Save to vault')).not.toBeInTheDocument();
  });

  it('Download on a vault cover copies that file, named after it', async () => {
    await openCoverMenu('Assets/photos/mountain.png');

    fireEvent.click(screen.getByText('Download'));

    expect(downloadResource).toHaveBeenCalledWith('/vault/Assets/photos/mountain.png', 'mountain.png');
    expect(downloadRemoteImage).not.toHaveBeenCalled();
  });
});

describe('PageHost: cover image — Copy image address and Copy image', () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  class FakeClipboardItem {
    constructor(readonly items: Record<string, Promise<Blob> | Blob>) {}
  }

  let writeText: ReturnType<typeof vi.fn>;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn(async () => {});
    write = vi.fn(async (items: FakeClipboardItem[]) => {
      for (const item of items) await Promise.all(Object.values(item.items));
    });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText, write }, configurable: true });
    fetchRemoteAsset.mockReset();
  });

  it('both are offered, after Position and before Download', async () => {
    await openCoverMenu('https://example.com/photos/mountain.png');

    const labels = screen.getAllByText(/^(Copy image|Copy image address|Download)$/).map((el) => el.textContent);
    expect(labels).toEqual(['Copy image', 'Copy image address', 'Download']);
  });

  it('Copy image address on a remote cover copies its URL exactly, query parameters included', async () => {
    const url = 'https://images.unsplash.com/photo-a?crop=entropy&ixid=abc%3D&q=80&w=4800';
    await openCoverMenu(url);

    fireEvent.click(screen.getByText('Copy image address'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(await screen.findByText('Image address copied')).toBeInTheDocument();
  });

  it('Copy image address on a vault cover copies its vault-relative path — not a file:// URL or an absolute path', async () => {
    await openCoverMenu('Assets/photos/mountain.png');

    fireEvent.click(screen.getByText('Copy image address'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Assets/photos/mountain.png'));
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('Copy image on a remote cover fetches it and puts image/png data — not text — on the clipboard', async () => {
    const url = 'https://example.com/photos/mountain.png';
    fetchRemoteAsset.mockResolvedValue({ bytes: PNG, contentType: 'image/png' });
    await openCoverMenu(url);

    fireEvent.click(screen.getByText('Copy image'));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(fetchRemoteAsset).toHaveBeenCalledWith(url);
    const [items] = write.mock.calls[0] as [FakeClipboardItem[]];
    expect(Object.keys(items[0]!.items)).toEqual(['image/png']);
    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByText('Image copied')).toBeInTheDocument();
  });

  it('Copy image on a vault cover reads the vault file and copies it as an image', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => PNG.buffer.slice(0) }));
    vi.stubGlobal('fetch', fetchMock);
    await openCoverMenu('Assets/mountain.png');

    fireEvent.click(screen.getByText('Copy image'));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('asset://localhost/vault/Assets/mountain.png');
    expect(await screen.findByText('Image copied')).toBeInTheDocument();
  });

  it('a failed download shows an error toast, never a success, and leaves the cover as it was', async () => {
    fetchRemoteAsset.mockRejectedValue(new Error('Could not download (404).'));
    const application = await openCoverMenu('https://example.com/photos/gone.png');

    fireEvent.click(screen.getByText('Copy image'));

    expect(await screen.findByText('Couldn’t copy the image')).toBeInTheDocument();
    expect(screen.queryByText('Image copied')).not.toBeInTheDocument();
    expect(write.mock.calls.length).toBeLessThanOrEqual(1);
    expect(application.vault.getPage('page-1')?.metadata.cover).toBe('https://example.com/photos/gone.png');
  });

  it('an image the clipboard cannot take (SVG) is reported as such', async () => {
    fetchRemoteAsset.mockResolvedValue({ bytes: new TextEncoder().encode('<svg></svg>'), contentType: 'image/svg+xml' });
    await openCoverMenu('https://example.com/logo.svg');

    fireEvent.click(screen.getByText('Copy image'));

    expect(await screen.findByText('This kind of image can’t be copied.')).toBeInTheDocument();
    expect(screen.queryByText('Image copied')).not.toBeInTheDocument();
  });

  it('a refused clipboard write is reported, with no success', async () => {
    fetchRemoteAsset.mockResolvedValue({ bytes: PNG, contentType: 'image/png' });
    write.mockRejectedValueOnce(new Error('NotAllowedError'));
    await openCoverMenu('https://example.com/photos/mountain.png');

    fireEvent.click(screen.getByText('Copy image'));

    expect(await screen.findByText('Couldn’t copy the image')).toBeInTheDocument();
    expect(screen.queryByText('Image copied')).not.toBeInTheDocument();
  });
});

describe('PageHost: right-click on the cover image', () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  class FakeClipboardItem {
    constructor(readonly items: Record<string, Promise<Blob> | Blob>) {}
  }

  let writeText: ReturnType<typeof vi.fn>;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn(async () => {});
    write = vi.fn(async (items: FakeClipboardItem[]) => {
      for (const item of items) await Promise.all(Object.values(item.items));
    });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText, write }, configurable: true });
    fetchRemoteAsset.mockReset();
  });

  async function renderCover(cover: string): Promise<HTMLImageElement> {
    const page = buildNoteWithCover(cover);
    const application = makeApplication([page], /^https?:\/\//.test(cover) ? [] : [vaultImage(cover)]);
    await application.pageOperations.open(page.id);
    render(
      <ToastProvider>
        <AppLayout application={application} />
      </ToastProvider>
    );
    await flush();
    const image = document.querySelector<HTMLImageElement>('.page-cover__image');
    expect(image).not.toBeNull();
    return image!;
  }

  it('shows Clutter’s menu — Copy and Copy image address — and suppresses the native one', async () => {
    const image = await renderCover('https://example.com/photos/mountain.png');

    expect(fireEvent.contextMenu(image, { clientX: 30, clientY: 50 })).toBe(false);

    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Copy', 'Copy image address']);
  });

  it('Copy on a remote cover writes image data — not text — to the clipboard, then says so', async () => {
    fetchRemoteAsset.mockResolvedValue({ bytes: PNG, contentType: 'image/png' });
    const image = await renderCover('https://example.com/photos/mountain.png');
    fireEvent.contextMenu(image);

    fireEvent.click(screen.getByText('Copy'));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const [items] = write.mock.calls[0] as [FakeClipboardItem[]];
    expect(Object.keys(items[0]!.items)).toEqual(['image/png']);
    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByText('Image copied')).toBeInTheDocument();
  });

  it('Copy on a vault cover reads the file and copies it as an image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => PNG.buffer.slice(0) })));
    const image = await renderCover('Assets/mountain.png');
    fireEvent.contextMenu(image);

    fireEvent.click(screen.getByText('Copy'));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Image copied')).toBeInTheDocument();
  });

  it('Copy image address copies a remote URL exactly, query parameters included', async () => {
    const url = 'https://images.unsplash.com/photo-a?crop=entropy&ixid=abc%3D&q=80&w=4800';
    const image = await renderCover(url);
    fireEvent.contextMenu(image);

    fireEvent.click(screen.getByText('Copy image address'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  });

  it('Copy image address copies a vault cover’s vault-relative path, not a file:// URL', async () => {
    const image = await renderCover('Assets/photos/mountain.png');
    fireEvent.contextMenu(image);

    fireEvent.click(screen.getByText('Copy image address'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Assets/photos/mountain.png'));
  });

  it('a failed copy shows an error toast and no success', async () => {
    fetchRemoteAsset.mockRejectedValue(new Error('Could not download (404).'));
    const image = await renderCover('https://example.com/photos/gone.png');
    fireEvent.contextMenu(image);

    fireEvent.click(screen.getByText('Copy'));

    expect(await screen.findByText('Couldn’t copy the image')).toBeInTheDocument();
    expect(screen.queryByText('Image copied')).not.toBeInTheDocument();
  });

  it('a right-click elsewhere in the page does not open the cover menu', async () => {
    await renderCover('https://example.com/photos/mountain.png');

    fireEvent.contextMenu(document.body);

    expect(screen.queryByText('Copy image address')).not.toBeInTheDocument();
  });
});

describe('PageHost: an image embedded in the note — Save to vault', () => {
  async function openImageMenu(application: Application, page: Page): Promise<void> {
    await application.pageOperations.open(page.id);
    render(<AppLayout application={application} />);
    await flush();
    const sizeButton = document.querySelector<HTMLButtonElement>('.cm-media-control[aria-label="Image size options"]');
    expect(sizeButton).not.toBeNull();
    fireEvent.mouseDown(sizeButton!);
    fireEvent.click(sizeButton!);
  }

  it('a remote image offers Save to vault, and choosing it runs the same save-to-vault flow with that URL', async () => {
    const url = 'https://example.com/photos/mountain.png';
    const page = buildNoteWithBody(`Text.\n\n![Mountain](${url})\n`);
    const application = makeApplication([page]);
    const save = vi
      .spyOn(application, 'saveRemoteImageToVault')
      .mockResolvedValue({ outcome: 'saved' } as never);
    await openImageMenu(application, page);

    fireEvent.click(screen.getByText('Save to vault'));

    await waitFor(() => expect(save).toHaveBeenCalledWith(url));
    expect(save).toHaveBeenCalledTimes(1);
  });
});

