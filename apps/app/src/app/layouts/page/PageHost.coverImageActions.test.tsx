// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
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

const { downloadRemoteImage, downloadResource } = vi.hoisted(() => ({
  downloadRemoteImage: vi.fn(async () => {}),
  downloadResource: vi.fn(async () => {}),
}));

// A vault path becomes a loadable URL through Tauri's convertFileSrc, which jsdom has no runtime for.
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}));
vi.mock('@shared/helpers/downloadRemoteImage', () => ({ downloadRemoteImage }));
vi.mock('@shared/helpers/downloadResource', () => ({ downloadResource }));

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

  render(<AppLayout application={application} />);
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

