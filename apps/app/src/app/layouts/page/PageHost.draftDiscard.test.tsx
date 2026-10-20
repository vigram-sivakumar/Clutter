// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render } from '@testing-library/react';
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
import { createNote } from '@features/notes/helpers/createNote';

/**
 * An empty new-note draft is discarded the moment the user leaves it, through the real UI: the sidebar's New
 * note, a click on another page's row, Back/Forward. (The lifecycle itself is covered in
 * PageOperations.navigation.test.ts; this proves the app wiring reaches it.)
 */
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(() => cleanup());

const ROOT = '/vault';
const note = (id: string, name: string) =>
  new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${name}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: `${name} body`,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });

async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function launch() {
  const vault = new Vault(ROOT, [note('a', 'A'), note('b', 'B')], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  await application.pageOperations.open('a');
  render(<AppLayout application={application} />);
  await flush();
  return { application, vault };
}

const sidebarRow = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.sidebar .entry')).find((entry) => entry.textContent?.trim() === name);

async function showNotesTab() {
  document.querySelector<HTMLElement>('.sidebar--tabs [role="tab"], .sidebar--tabs button')?.click();
  await flush();
}

describe('an empty new-note draft, through the real UI', () => {
  it('is discarded when the user clicks another page, and does not come back on Back/Forward', async () => {
    const { application, vault } = await launch();
    await act(async () => {
      await createNote(application.folderOperations, application.pageOperations);
    });
    await flush();
    const draftId = application.workspace.activePageId!;
    expect(application.pageOperations.getDraft(draftId)).toBeDefined();
    const pagesBefore = Array.from(vault.pages()).length;

    await showNotesTab();
    await act(async () => sidebarRow('B')!.click());
    await flush();

    expect(application.workspace.activePageId).toBe('b');
    expect(application.pageOperations.getDraft(draftId)).toBeUndefined();
    expect(application.workspace.openPages).not.toContain(draftId);
    expect(Array.from(vault.pages()).length).toBe(pagesBefore);

    await act(async () => application.navigation.back());
    await flush();
    await act(async () => application.navigation.forward());
    await flush();
    expect(application.workspace.activePageId).not.toBe(draftId);
    expect(application.pageOperations.getDraft(draftId)).toBeUndefined();
  });

  it('is discarded when the user opens a folder or a filtered view instead', async () => {
    const { application } = await launch();
    await act(async () => {
      await createNote(application.folderOperations, application.pageOperations);
    });
    await flush();
    const draftId = application.workspace.activePageId!;

    await act(async () => application.navigation.openAllTasks());
    await flush();

    expect(application.pageOperations.getDraft(draftId)).toBeUndefined();
    expect(application.workspace.openPages).not.toContain(draftId);
  });

  it('a draft with content is kept: it becomes a real note, not discarded', async () => {
    const { application, vault } = await launch();
    await act(async () => {
      await createNote(application.folderOperations, application.pageOperations);
    });
    await flush();
    const draftId = application.workspace.activePageId!;
    application.pageOperations.commitEdit(draftId, 'Keep me');

    await act(async () => application.pageOperations.open('b'));
    await flush();
    await vi.waitFor(() => expect(vault.getPage(draftId)).toBeDefined());

    expect(vault.getPage(draftId)!.source.markdown).toContain('Keep me');
  });
});

describe('UI code reopens a draft through the PageOperations facade', () => {
  // A bare `workspace.openPage(draftId)` re-activates a draft as a history stop (recordable by default), bypassing
  // the rule PageOperations owns for drafts — the route that once let an empty plain draft survive leaving it.
  const read = (relative: string) => readFileSync(join(__dirname, relative), 'utf8');

  it.each([
    ['PageHost.tsx', 'PageHost.tsx'],
    ['the sidebar', '../sidebar/Sidebar.tsx'],
    ['the Tags sidebar', '../../../features/tags/sidebar/Sidebar.Tags.tsx'],
  ])('%s makes no bare workspace.openPage call', (_name, file) => {
    expect(read(file)).not.toMatch(/\bworkspace\.openPage\(/);
  });
});
