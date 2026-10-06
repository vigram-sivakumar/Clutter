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
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Page } from '@core/vault/models/Page';

/**
 * Title editability through the real AppLayout composition (PageHost -> Page -> PageTitle),
 * for every route a page can reach the screen by. The invariant: a Daily Note's title (the
 * date) is never an editable control — draft or saved, however it was opened — and a regular
 * note's title always is. The rule itself lives in core/presentation/isPageTitleEditable.ts.
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

function makeApplication(pages: Page[] = []): Application {
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
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const titleRoot = () => document.querySelector<HTMLElement>('.page-title')!;
const editableControlsInTitle = () =>
  titleRoot().querySelectorAll('[contenteditable], [role="textbox"], input, textarea');

/** A Daily Note that has never been saved: opened by path, so it is a draft. */
async function openDraftDailyNote() {
  const application = makeApplication();
  const id = await application.pageOperations.openAtPath(DailyNotePath.absoluteFrom(ROOT, DATE), {
    type: 'daily-note',
    title: ISO,
  });
  expect(application.pageOperations.getDraft(id)).toBeDefined();
  return { application, id };
}

/** A Daily Note already in the vault. */
async function openSavedDailyNote() {
  const page = buildPage(DailyNotePath.absoluteFrom(ROOT, DATE), `daily-${ISO}`);
  const application = makeApplication([page]);
  await application.pageOperations.open(page.id);
  return { application, id: page.id };
}

describe('Daily Note title is never editable', () => {
  it.each([
    ['a draft', openDraftDailyNote],
    ['a saved note', openSavedDailyNote],
  ])('%s: renders the date as static text with no editable control', async (_label, open) => {
    await open();
    render(<AppLayout application={(await open()).application} />);
    await flush();

    expect(titleRoot().textContent).toMatch(/15 January 2026/);
    expect(editableControlsInTitle()).toHaveLength(0);
  });

  it.each([
    ['a draft', openDraftDailyNote],
    ['a saved note', openSavedDailyNote],
  ])('%s: clicking, double-clicking and typing change nothing and leave no focus on the title', async (_label, open) => {
    const { application } = await open();
    render(<AppLayout application={application} />);
    await flush();
    const before = titleRoot().textContent;

    fireEvent.mouseDown(titleRoot());
    fireEvent.click(titleRoot());
    fireEvent.doubleClick(titleRoot());
    for (const key of ['X', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'Enter']) {
      fireEvent.keyDown(titleRoot(), { key });
    }
    fireEvent.input(titleRoot(), { data: 'X' });
    await flush();

    expect(titleRoot().textContent).toBe(before);
    expect(titleRoot().contains(document.activeElement)).toBe(false);
    expect(editableControlsInTitle()).toHaveLength(0);
  });

  it('a draft Daily Note has no title-edit path into PageOperations', async () => {
    const { application } = await openDraftDailyNote();
    const updateDraftTitle = vi.spyOn(application.pageOperations, 'updateDraftTitle');
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.input(titleRoot(), { data: 'Hijacked' });
    fireEvent.blur(titleRoot());
    await flush();

    expect(updateDraftTitle).not.toHaveBeenCalled();
    expect(titleRoot().textContent).toMatch(/15 January 2026/);
  });

  it('the displayed title stays derived from the date it belongs to', async () => {
    const { application, id } = await openDraftDailyNote();
    render(<AppLayout application={application} />);
    await flush();

    expect(application.pageOperations.getDraft(id)?.title).toBe(ISO);
    expect(titleRoot().textContent).toMatch(/15 January 2026/);
  });
});

describe('A regular note title is editable', () => {
  it('draft: renders an editable textbox', async () => {
    const application = makeApplication();
    await application.pageOperations.openDraft({ folderId: null });
    render(<AppLayout application={application} />);
    await flush();

    expect(editableControlsInTitle().length).toBeGreaterThan(0);
  });

  it('saved: renders an editable textbox', async () => {
    const page = buildPage(`${ROOT}/Meeting.md`, 'note-1');
    const application = makeApplication([page]);
    await application.pageOperations.open(page.id);
    render(<AppLayout application={application} />);
    await flush();

    expect(editableControlsInTitle().length).toBeGreaterThan(0);
  });
});
