// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

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
import { FolderBuilder } from '@core/vault/ingest/FolderBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

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

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';
const folderBuilder = new FolderBuilder();

function folder(path: string, parentPath: string | null): Folder {
  // A folder's id is its path when it has no frontmatter id.
  return folderBuilder.build({ parentId: parentPath, directory: { path, parentPath, frontmatter: null } });
}

function pageIn(folderPath: string, id: string, name: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: folderPath,
    page: {
      path: `${folderPath}/${name}.md`,
      directoryPath: folderPath,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: `${name} body`,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

const PROJECTS = `${ROOT}/Projects`;
const INBOX = `${ROOT}/Inbox`;
const TEMPLATES = `${ROOT}/Templates`;
const ARCHIVE = `${ROOT}/Archive`;

function makeApplication(): Application {
  const folders = [
    folder(PROJECTS, null),
    folder(INBOX, null),
    folder(TEMPLATES, null),
    folder(ARCHIVE, null),
    folder(`${PROJECTS}/Sub`, PROJECTS),
    folder(`${TEMPLATES}/Meetings`, TEMPLATES),
    folder(`${INBOX}/Triage`, INBOX),
  ];
  const pages = [
    pageIn(PROJECTS, 'plan', 'Plan'),
    pageIn(INBOX, 'captured', 'Captured'),
    pageIn(TEMPLATES, 'tpl', 'Meeting'),
    pageIn(ARCHIVE, 'old', 'Old note'),
  ];
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const fileSystem = new InMemoryVaultFileSystem();
  for (const page of pages) {
    fileSystem.seedFile(page.path, page.source.markdown);
  }
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    undefined,
    undefined
  );
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


async function renderNote(pageId: string): Promise<Application> {
  const application = makeApplication();
  await application.pageOperations.open(pageId);
  render(<AppLayout application={application} />);
  await flush();
  return application;
}

/** Topbar More actions → the "Move to…" row: the shared Move to picker must open. */
async function chooseMoveTo(): Promise<void> {
  fireEvent.click(document.querySelector<HTMLElement>('button[aria-label="More actions"]')!);
  await flush();
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent?.trim() === 'Move to…');
  expect(item, 'the Move to… row is offered').toBeDefined();
  fireEvent.click(item!);
  await flush();
}

const pickerTitle = () => document.querySelector('.picker-card__header')?.textContent;
const pickerRows = () => [...document.querySelectorAll('.picker-list__title')].map((el) => el.textContent);

describe('Move to from the topbar opens the one shared picker — for every kind of item', () => {
  it('an ordinary note', async () => {
    await renderNote('plan');
    await chooseMoveTo();

    expect(pickerTitle()).toBe('Move to');
    expect(pickerRows()).toEqual(expect.arrayContaining(['Templates', 'Projects']));
  });

  it('a template note (the regression: the item was offered but nothing opened)', async () => {
    await renderNote('tpl');
    await chooseMoveTo();

    expect(pickerTitle()).toBe('Move to');
    const rows = pickerRows();
    expect(rows.slice(0, 1)).toEqual(['Templates']);
    expect(rows).toEqual(expect.arrayContaining(['Projects', 'Meetings', 'Sub']));
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('a template folder', async () => {
    await renderFolder(`${TEMPLATES}/Meetings`);
    await chooseMoveTo();

    expect(pickerTitle()).toBe('Move to');
    expect(pickerRows().slice(0, 2)).toEqual(['vault', 'Templates']);
    // Itself is never offered as a destination.
    expect(pickerRows()).not.toContain('Meetings');
  });

  it('selecting a destination moves the template out of Templates and closes the picker; cancelling moves nothing', async () => {
    const application = await renderNote('tpl');
    await chooseMoveTo();
    fireEvent.click(document.querySelector<HTMLElement>('.picker-card button[aria-label="Dismiss"]')!);
    await flush();
    expect(pickerTitle()).toBeUndefined();
    expect(application.vault.getPage('tpl')!.parentId).toBe(TEMPLATES);

    await chooseMoveTo();
    fireEvent.click([...document.querySelectorAll<HTMLElement>('.picker-list__item')].find((el) => el.textContent === 'Projects')!);
    await flush();

    expect(application.vault.getPage('tpl')!.path).toBe(`${PROJECTS}/Meeting.md`);
    expect(application.vault.getPage('tpl')!.id).toBe('tpl');
    expect(pickerTitle()).toBeUndefined();
  });
});
