// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
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
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Page } from '@core/vault/models/Page';
import { writeHeaderSeparatorMode, writeHeaderSeparatorStyle } from './headerSeparator';

/**
 * The Header separator preference applies to regular notes and daily notes alike: both render through the one shared page
 * layout, so the same preference and the same Properties-section rule decide the rule between header and body.
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
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const ROOT = '/vault';
const ISO = '2026-01-15';
const DATE = new Date(2026, 0, 15);

function buildPage(path: string, id: string, frontmatter: Record<string, unknown> = {}): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id, ...frontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function makeApplication(pages: Page[] = [], fileSystem = new InMemoryVaultFileSystem()): Application {
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
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const NOTE_PATH = `${ROOT}/Note.md`;
const DAILY_PATH = DailyNotePath.absoluteFrom(ROOT, DATE);

type Kind = 'note' | 'daily note';
const KINDS: readonly Kind[] = ['note', 'daily note'];

/** A saved page of the kind, with a declared system property (so its Properties section lists something) or none. */
async function openPage(kind: Kind, withProperties: boolean) {
  // A declared system property is a key of the file's entry order; a page read from a file with none has no section.
  const frontmatter = withProperties ? { tags: ['work'], entryOrder: ['id', 'tags'] } : {};
  const page =
    kind === 'note'
      ? buildPage(NOTE_PATH, 'note-1', frontmatter)
      : buildPage(DAILY_PATH, `daily-${ISO}`, frontmatter);
  const application = makeApplication([page]);
  await application.pageOperations.open(page.id);
  render(<AppLayout application={application} />);
  await flush();
}

const separator = () => document.querySelector('.page-divider');
const propertiesSection = () => document.querySelector('.page__properties');

describe.each(KINDS)('Header separator on a %s', (kind) => {
  it('Automatic: shown with its Properties section', async () => {
    await openPage(kind, true);

    expect(propertiesSection()).not.toBeNull();
    expect(separator()).not.toBeNull();
  });

  it('Automatic: hidden when it has no Properties section', async () => {
    await openPage(kind, false);

    expect(propertiesSection()).toBeNull();
    expect(separator()).toBeNull();
  });

  it('Always show: shown with or without a Properties section', async () => {
    localStorage.setItem('clutter-header-separator', 'show');
    await openPage(kind, false);

    expect(propertiesSection()).toBeNull();
    expect(separator()).not.toBeNull();
    cleanup();

    await openPage(kind, true);
    expect(separator()).not.toBeNull();
  });

  it('Always hide: never shown, even with a Properties section', async () => {
    localStorage.setItem('clutter-header-separator', 'hide');
    await openPage(kind, true);

    expect(propertiesSection()).not.toBeNull();
    expect(separator()).toBeNull();
  });

  it.each([
    ['Line', 'solid'],
    ['Wavy', 'wavy'],
    ['Dotted', 'dotted'],
  ] as const)('draws the %s style as the divider\'s %s variant', async (_label, variant) => {
    localStorage.setItem('clutter-header-separator-style', variant);
    await openPage(kind, true);

    expect(separator()).toHaveAttribute('data-variant', variant);
  });

  it('is a Line (solid) by default', async () => {
    await openPage(kind, true);

    expect(separator()).toHaveAttribute('data-variant', 'solid');
  });

  it('keeps the chosen style when the visibility changes, and the visibility when the style changes', async () => {
    localStorage.setItem('clutter-header-separator-style', 'dotted');
    await openPage(kind, true);

    act(() => writeHeaderSeparatorMode('hide'));
    expect(separator()).toBeNull();
    act(() => writeHeaderSeparatorMode('automatic'));
    expect(separator()).toHaveAttribute('data-variant', 'dotted');

    act(() => writeHeaderSeparatorMode('hide'));
    act(() => writeHeaderSeparatorStyle('wavy'));
    expect(separator()).toBeNull();
  });

  it('follows the preference changing while the page is open', async () => {
    await openPage(kind, true);
    expect(separator()).not.toBeNull();

    act(() => writeHeaderSeparatorMode('hide'));
    expect(separator()).toBeNull();
  });
});

describe('Header separator is limited to notes and daily notes', () => {
  /** Opens a page of the kind in an application whose vault also holds a note, with the separator forced on. */
  async function openOther(open: (application: Application) => void | Promise<void>) {
    localStorage.setItem('clutter-header-separator', 'show');
    localStorage.setItem('clutter-header-separator-style', 'wavy');
    const note = buildPage(NOTE_PATH, 'note-1', { tags: ['work'], entryOrder: ['id', 'tags'] });
    const application = makeApplication([note]);
    await open(application);
    render(<AppLayout application={application} />);
    await flush();
    return application;
  }

  const OTHER_PAGES: [string, (application: Application) => void | Promise<void>][] = [
    ['the Inbox', (a) => a.navigation.openInbox()],
    ['Templates', (a) => a.navigation.openTemplates()],
    ['Assets', (a) => a.navigation.openAssets()],
    ['the vault root (folders)', (a) => a.navigation.openWorkspace()],
    ['Favorites', (a) => a.navigation.openFavorites()],
    ['the Archive', (a) => a.navigation.openArchive()],
    ['All tasks', (a) => a.navigation.openAllTasks()],
    ['Unscheduled tasks', (a) => a.navigation.openTasksUnscheduled()],
    ['a tag collection', (a) => a.navigation.openTag('design')],
    [
      'a folder',
      async (a) => {
        await a.folderOperations.open(await a.folderOperations.create('Projects', null));
      },
    ],
  ];

  it.each(OTHER_PAGES)('%s never shows the separator, even when it is set to always show', async (_name, open) => {
    await openOther(open);

    // The page itself is on screen...
    expect(document.querySelector('.page__content')).not.toBeNull();
    // ...and carries no separator.
    expect(separator()).toBeNull();
  });

  it('while a note, with the same preferences, does', async () => {
    localStorage.setItem('clutter-header-separator', 'show');
    await openPage('note', true);

    expect(separator()).not.toBeNull();
  });

  it('the Settings dialog does not render it either', async () => {
    localStorage.setItem('clutter-header-separator', 'show');
    const { Settings } = await import('@features/settings/Settings');
    render(<Settings />);

    expect(separator()).toBeNull();
  });
});
