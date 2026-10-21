// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
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

/**
 * An empty Daily Note draft is temporary (ADR-059): leaving it for another Daily Note through the sidebar discards it, and
 * its row leaves the Daily notes list — even though navigation history recorded the stop. A draft with content and a saved
 * Daily Note are never discarded.
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

function buildPage(path: string, id: string, content = ''): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content,
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

const TODAY = new Date(2026, 0, 15, 10, 0);
const day = (n: number) => DailyNotePath.absoluteFrom(ROOT, new Date(2026, 0, n));
const PLACEHOLDER = 'Start typing…';

beforeEach(() => {
  // Only the clock: the date decides which row is "today" (it always has a row of its own).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});
afterEach(() => vi.useRealTimers());

/** A vault holding one saved Daily Note (the 12th), the Daily notes tab on screen, and an empty draft for the 13th. */
async function openWithEmptyDraft() {
  const saved = buildPage(day(12), 'daily-12', 'Saved on the 12th');
  const application = makeApplication([saved]);
  application.workspace.setActiveSidebarTab('daily-notes');
  const draftId = await application.pageOperations.openAtPath(day(13), { type: 'daily-note' });
  render(<AppLayout application={application} />);
  await flush();
  return { application, saved, draftId };
}

// The Daily notes list only: the page's own title and editor echo the same text.
const sidebar = () => within(document.querySelector<HTMLElement>('.sidebar')!);
const placeholders = () => sidebar().queryAllByText(PLACEHOLDER);
const savedRow = () => sidebar().getByText('Saved on the 12th');

describe('Daily notes sidebar: an empty Daily Note draft is temporary', () => {
  it('shows the empty draft as a row while it is open (beside Today\'s own row)', async () => {
    const { application, draftId } = await openWithEmptyDraft();

    expect(application.pageOperations.getDraft(draftId)).toBeDefined();
    expect(placeholders()).toHaveLength(2); // Today, and the 13th's draft
  });

  it('clicking a saved Daily Note in the sidebar discards the draft and removes its row', async () => {
    const { application, saved, draftId } = await openWithEmptyDraft();

    fireEvent.click(savedRow());
    await flush();

    expect(application.workspace.activePageId).toBe(saved.id);
    expect(application.pageOperations.getDraft(draftId)).toBeUndefined();
    expect(application.workspace.openPages).not.toContain(draftId);
    expect(placeholders()).toHaveLength(1); // only Today's own row is left
    expect(savedRow()).toBeInTheDocument(); // the saved Daily Note is untouched
  });

  it('Back and Forward then skip the discarded draft: it is never reopened or recreated', async () => {
    const { application, saved, draftId } = await openWithEmptyDraft();
    fireEvent.click(savedRow());
    await flush();

    act(() => application.navigation.back());
    await flush();
    expect(application.workspace.activePageId).toBe(saved.id);
    act(() => application.navigation.forward());
    await flush();

    expect(application.workspace.activePageId).toBe(saved.id);
    expect(application.pageOperations.getDraft(draftId)).toBeUndefined();
    expect(application.vault.getPage(draftId)).toBeUndefined();
    expect(placeholders()).toHaveLength(1);
  });

  it('a draft that has content is kept: it becomes a real Daily Note instead of being discarded', async () => {
    const { application, draftId } = await openWithEmptyDraft();
    act(() => application.pageOperations.commitEdit(draftId, 'Notes for the 13th'));

    fireEvent.click(savedRow());
    await flush();

    expect(application.pageOperations.getDraft(draftId)).toBeUndefined(); // promoted
    expect(application.vault.getPage(draftId)?.path).toBe(day(13));
    expect(sidebar().getByText('Notes for the 13th')).toBeInTheDocument();
    expect(placeholders()).toHaveLength(1);
  });

  it('today\'s own row stays, as before', async () => {
    const { application, saved } = await openWithEmptyDraft();

    fireEvent.click(savedRow());
    await flush();

    expect(application.workspace.activePageId).toBe(saved.id);
    expect(placeholders()).toHaveLength(1);
  });
});
