// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { featureFlags } from '@core/featureFlags';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { FolderBuilder } from '@core/vault/ingest/FolderBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

/**
 * Daily Notes' own collection pages (the Daily Notes page of years, a year's page of months, a month's
 * page of days) and the Daily Note's breadcrumb that opens them, behind `featureFlags
 * .dailyNotesCollectionPages`. Through the real AppLayout composition, on a real Daily Notes tree.
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

const defaultFlag = featureFlags.dailyNotesCollectionPages;
beforeEach(() => {
  featureFlags.dailyNotesCollectionPages = true;
});
afterEach(() => {
  featureFlags.dailyNotesCollectionPages = defaultFlag;
  cleanup();
});

const ROOT = '/vault';
const folderBuilder = new FolderBuilder();

function folder(path: string, parentPath: string | null): Folder {
  const parentId = parentPath; // a folder's id is its path when it has no frontmatter id
  return folderBuilder.build({ parentId, directory: { path, parentPath, frontmatter: null } });
}

// Deliberately created out of order, so the order on screen is the page's doing, not the data's.
const FOLDERS: Folder[] = [
  folder(`${ROOT}/Daily Notes`, null),
  folder(`${ROOT}/Daily Notes/2025`, `${ROOT}/Daily Notes`),
  folder(`${ROOT}/Daily Notes/2024`, `${ROOT}/Daily Notes`),
  folder(`${ROOT}/Daily Notes/2026`, `${ROOT}/Daily Notes`),
  folder(`${ROOT}/Daily Notes/2026/October`, `${ROOT}/Daily Notes/2026`),
  folder(`${ROOT}/Daily Notes/2026/January`, `${ROOT}/Daily Notes/2026`),
  folder(`${ROOT}/Daily Notes/2026/April`, `${ROOT}/Daily Notes/2026`),
  folder(`${ROOT}/Projects`, null),
];

function dailyNote(isoDate: string): Page {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  const path = DailyNotePath.absoluteFrom(ROOT, date);
  const directoryPath = path.slice(0, path.lastIndexOf('/'));
  return new PageBuilder(ROOT).build({
    parentId: directoryPath,
    page: {
      path,
      directoryPath,
      frontmatter: { id: `daily-${isoDate}` },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function regularNote(): Page {
  return new PageBuilder(ROOT).build({
    parentId: `${ROOT}/Projects`,
    page: {
      path: `${ROOT}/Projects/Plan.md`,
      directoryPath: `${ROOT}/Projects`,
      frontmatter: { id: 'plan' },
      frontmatterAnalysis: { aliases: [] },
      content: 'A plan',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function makeApplication(): Application {
  const pages = [dailyNote('2026-10-03'), dailyNote('2026-10-04'), regularNote()];
  const vault = new Vault(
    ROOT,
    pages,
    FOLDERS,
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
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderFolder(path: string): Promise<Application> {
  const application = makeApplication();
  await application.folderOperations.open(path);
  render(<AppLayout application={application} />);
  await flush();
  return application;
}

async function renderDailyNote(isoDate: string): Promise<Application> {
  const application = makeApplication();
  await application.pageOperations.open(dailyNote(isoDate).id);
  render(<AppLayout application={application} />);
  await flush();
  return application;
}

/** The folder cards on the page, by the year / month name they start with (the card also carries counts). */
function folderCardNames(): string[] {
  return Array.from(document.querySelectorAll('.collection-grid--fixed-rows > .collection-card:not(.collection-card--empty)')).map(
    (card) => (card.textContent ?? '').match(/^(\d{4}|[A-Za-z]+)/)?.[1] ?? ''
  );
}

const hasCreateFolderCard = () => document.querySelector('.collection-grid--fixed-rows > .collection-card--empty') !== null;
const hasHeaderPlus = () => document.querySelector('button[aria-label="New"]') !== null;
const noteRows = () =>
  document.querySelectorAll('.collection-table__body .collection-table-row:not(.collection-table-row--new-item), .collection-list .collection-row').length;

describe('Daily Notes collection pages (flag on)', () => {
  it('the Daily Notes page lists the years latest to oldest, with no notes section, no create-folder card and no "+"', async () => {
    await renderFolder(`${ROOT}/Daily Notes`);

    expect(folderCardNames()).toEqual(['2026', '2025', '2024']);
    expect(hasCreateFolderCard()).toBe(false);
    expect(hasHeaderPlus()).toBe(false);
    expect(noteRows()).toBe(0);
    expect(document.body.textContent).not.toContain('New Note');
  });

  it('a year page lists its months January to December (not alphabetical), with no notes section, create-folder card or "+"', async () => {
    await renderFolder(`${ROOT}/Daily Notes/2026`);

    expect(folderCardNames()).toEqual(['January', 'April', 'October']);
    expect(hasCreateFolderCard()).toBe(false);
    expect(hasHeaderPlus()).toBe(false);
    expect(noteRows()).toBe(0);
    expect(document.body.textContent).not.toContain('New Note');
  });

  it('a month page still lists its days, but offers no create-folder card, no "+" and no New Note row', async () => {
    await renderFolder(`${ROOT}/Daily Notes/2026/October`);

    expect(folderCardNames()).toEqual([]);
    expect(hasCreateFolderCard()).toBe(false);
    expect(hasHeaderPlus()).toBe(false);
    expect(document.body.textContent).not.toContain('New Note');
    expect(noteRows()).toBe(2);
  });

  it('an ordinary folder is unchanged: its "+" and notes section are still there', async () => {
    await renderFolder(`${ROOT}/Projects`);

    // Projects holds a note and no subfolders: a section offers Create only once it has an item, so no create-folder card.
    expect(hasCreateFolderCard()).toBe(false);
    expect(hasHeaderPlus()).toBe(true);
    expect(noteRows()).toBe(1);
  });

  it('a Daily Note shows its breadcrumb, and its ancestors open the collection pages', async () => {
    await renderDailyNote('2026-10-04');

    const breadcrumb = document.querySelector('.breadcrumb');
    expect(breadcrumb).not.toBeNull();

    fireEvent.click(breadcrumb!.querySelector('button')!);
    const year = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent === '2026'
    );
    expect(year).toBeDefined();
    fireEvent.click(year!);
    await flush();

    expect(folderCardNames()).toEqual(['January', 'April', 'October']);
  });
});

describe('the feature flag', () => {
  it('is off by default', () => {
    expect(defaultFlag).toBe(false);
  });
});

describe('nothing on a Daily Notes page offers creating a note or folder', () => {
  async function menuLabelsOfEveryMoreActions(path: string): Promise<string[][]> {
    // How many "More actions" buttons the page has, then each one's menu, on a fresh render.
    await renderFolder(path);
    const count = document.querySelectorAll('button[aria-label="More actions"]').length;
    cleanup();

    const all: string[][] = [];
    for (let index = 0; index < count; index++) {
      await renderFolder(path);
      fireEvent.click(document.querySelectorAll('button[aria-label="More actions"]')[index]!);
      await flush();
      all.push(
        Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent ?? '')
      );
      cleanup();
    }
    return all;
  }

  it.each([
    ['the Daily Notes page', `${ROOT}/Daily Notes`],
    ['a year page', `${ROOT}/Daily Notes/2026`],
    ['a month page', `${ROOT}/Daily Notes/2026/October`],
  ])('%s: no create/new item in any of its menus, no "+", no create-folder card', async (_label, path) => {
    for (const labels of await menuLabelsOfEveryMoreActions(path)) {
      expect(labels.filter((label) => /\b(new|create)\b/i.test(label))).toEqual([]);
    }

    await renderFolder(path);
    expect(hasHeaderPlus()).toBe(false);
    expect(hasCreateFolderCard()).toBe(false);
  });
});

describe('Daily Notes collection pages (flag off)', () => {
  beforeEach(() => {
    featureFlags.dailyNotesCollectionPages = false;
  });

  it('a Daily Note shows only its own crumb, with no ancestors to open', async () => {
    await renderDailyNote('2026-10-04');

    expect(document.querySelector('.breadcrumb-item')).not.toBeNull();
    expect(document.querySelector('.breadcrumb')).toBeNull();
  });

  it('an ordinary note keeps its breadcrumb', async () => {
    const application = makeApplication();
    await application.pageOperations.open('plan');
    render(<AppLayout application={application} />);
    await flush();

    expect(document.querySelector('.breadcrumb')).not.toBeNull();
  });

  it('a Daily Notes folder card opens nothing: the page stays where it is', async () => {
    await renderFolder(`${ROOT}/Daily Notes`);
    const before = folderCardNames();
    expect(before.length).toBeGreaterThan(0);

    fireEvent.click(document.querySelector('.collection-grid--fixed-rows > .collection-card:not(.collection-card--empty)')!);
    await flush();

    await waitFor(() => expect(folderCardNames()).toEqual(before));
  });
});
