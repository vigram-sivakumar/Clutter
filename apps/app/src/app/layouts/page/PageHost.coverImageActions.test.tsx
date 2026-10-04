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

function buildNoteWithCover(cover: string): Page {
  const builder = new PageBuilder(ROOT);
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1', cover },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function makeApplication(pages: Page[]): Application {
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
    []
  );
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
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

async function openCoverMenu(cover: string): Promise<Application> {
  const page = buildNoteWithCover(cover);
  const application = makeApplication([page]);
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
