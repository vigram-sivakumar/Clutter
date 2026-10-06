// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

/**
 * A Daily Note in the Trash, through the real AppLayout composition: it keeps its Daily Note
 * identity (the same date title, never editable), and restoring it when its day already has a
 * Daily Note asks instead of overwriting (Move to Inbox / Replace). See ADR-042.
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
const DATE = new Date(2026, 0, 15);
const DAILY_PATH = DailyNotePath.absoluteFrom(ROOT, DATE);
const folderBuilder = new FolderBuilder();

function folder(path: string, parentPath: string | null): Folder {
  return folderBuilder.build({ parentId: parentPath, directory: { path, parentPath, frontmatter: null } });
}

function buildPage(path: string, id: string, content: string, parentId: string | null): Page {
  return new PageBuilder(ROOT).build({
    parentId,
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

/** A vault with the Daily Notes folder chain, Archive and Inbox, and one Daily Note for DATE. */
function makeApplication() {
  const dailyDir = DAILY_PATH.slice(0, DAILY_PATH.lastIndexOf('/'));
  const folders = [
    folder(`${ROOT}/Daily Notes`, null),
    folder(`${ROOT}/Daily Notes/2026`, `${ROOT}/Daily Notes`),
    folder(dailyDir, `${ROOT}/Daily Notes/2026`),
    folder(`${ROOT}/Archive`, null),
    folder(`${ROOT}/Inbox`, null),
  ];
  const monthFolder = folders.find((f) => f.path === dailyDir)!;
  const dailyNote = buildPage(DAILY_PATH, 'daily-1', 'Trashed day.', monthFolder.id);
  const vault = new Vault(
    ROOT,
    [dailyNote],
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
  fileSystem.seedFile(DAILY_PATH, new FrontmatterSerializer().serializeDocument(dailyNote, 'Trashed day.'));
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return { application, dailyNote, monthFolder, fileSystem };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const titleRoot = () => document.querySelector<HTMLElement>('.page-title')!;
const editableInTitle = () => titleRoot().querySelectorAll('[contenteditable], [role="textbox"], input, textarea');
const moreActions = () => document.querySelector<HTMLElement>('button[aria-label="More actions"]')!;

async function clickMenuItem(label: string) {
  fireEvent.click(moreActions());
  await flush();
  fireEvent.click(
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent === label)!
  );
  await flush();
}

describe('A Daily Note in the Trash keeps its title', () => {
  it('shows the same date title before trashing, while in the Trash, and after restoring — never editable', async () => {
    const { application, dailyNote } = makeApplication();
    await application.pageOperations.open(dailyNote.id);
    render(<AppLayout application={application} />);
    await flush();

    const activeTitle = titleRoot().textContent;
    expect(activeTitle).toMatch(/15 January 2026/);
    expect(activeTitle).not.toContain('2026-01-15');
    expect(editableInTitle()).toHaveLength(0);

    await application.pageOperations.archive(dailyNote.id);
    await flush();

    expect(application.vault.getPage(dailyNote.id)!.metadata.status).toBe('archived');
    expect(titleRoot().textContent).toBe(activeTitle);
    expect(editableInTitle()).toHaveLength(0);
    fireEvent.input(titleRoot(), { data: 'X' });
    fireEvent.keyDown(titleRoot(), { key: 'Backspace' });
    expect(titleRoot().textContent).toBe(activeTitle);

    await clickMenuItem('Restore');

    const restored = application.vault.getPage(dailyNote.id)!;
    expect(restored.path).toBe(DAILY_PATH);
    expect(restored.name).toBe('2026-01-15');
    expect(titleRoot().textContent).toBe(activeTitle);
    expect(editableInTitle()).toHaveLength(0);
  });
});

describe('Restoring a Daily Note whose day already has one', () => {
  async function trashedWithNewerNote() {
    const context = makeApplication();
    const { application, dailyNote, monthFolder, fileSystem } = context;
    await application.pageOperations.open(dailyNote.id);
    await application.pageOperations.archive(dailyNote.id);
    const newer = buildPage(DAILY_PATH, 'daily-2', 'Written later.', monthFolder.id);
    application.vault.addPage(newer);
    fileSystem.seedFile(DAILY_PATH, new FrontmatterSerializer().serializeDocument(newer, 'Written later.'));
    render(<AppLayout application={application} />);
    await flush();
    return { ...context, newer };
  }

  const dialog = () => screen.queryByText('Restore Daily Note');

  it('asks instead of overwriting: Move to Inbox / Replace, a close button, no Cancel', async () => {
    const { application, dailyNote, newer } = await trashedWithNewerNote();

    await clickMenuItem('Restore');

    expect(dialog()).toBeInTheDocument();
    expect(document.querySelector('.confirmation__body')!.textContent).toBe(
      'A Daily Note for January 15 already exists.\nWhat would you like to do?'
    );
    expect(screen.getByRole('button', { name: 'Move to Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    // Nothing has happened yet.
    expect(application.vault.getPage(dailyNote.id)!.metadata.status).toBe('archived');
    expect(application.vault.getPage(newer.id)!.path).toBe(DAILY_PATH);
  });

  it('closing the dialog leaves the note in the Trash', async () => {
    const { application, dailyNote, newer } = await trashedWithNewerNote();
    await clickMenuItem('Restore');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await flush();

    expect(dialog()).toBeNull();
    expect(application.vault.getPage(dailyNote.id)!.metadata.status).toBe('archived');
    expect(application.vault.getPage(newer.id)!.source.markdown).toBe('Written later.');
  });

  it('Move to Inbox restores it as a normal note, leaves the existing one alone, and toasts with Open', async () => {
    const { application, dailyNote, newer, fileSystem } = await trashedWithNewerNote();
    const existingBefore = await fileSystem.readFile(DAILY_PATH);
    await clickMenuItem('Restore');

    fireEvent.click(screen.getByRole('button', { name: 'Move to Inbox' }));
    await flush();

    const restored = application.vault.getPage(dailyNote.id)!;
    expect(restored.path).toBe(`${ROOT}/Inbox/2026-01-15.md`);
    expect(restored.type).toBe('note');
    expect(application.vault.getPage(newer.id)!.type).toBe('daily-note');
    expect(await fileSystem.readFile(DAILY_PATH)).toBe(existingBefore);

    expect(screen.getByRole('status')).toHaveTextContent('Restored to Inbox');
    const open = vi.spyOn(application.pageOperations, 'open');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith(dailyNote.id);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Replace deletes the existing Daily Note and restores into its place', async () => {
    const { application, dailyNote, newer } = await trashedWithNewerNote();
    await clickMenuItem('Restore');

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    await flush();

    expect(application.vault.getPage(newer.id)).toBeUndefined();
    const restored = application.vault.getPage(dailyNote.id)!;
    expect(restored.path).toBe(DAILY_PATH);
    expect(restored.type).toBe('daily-note');
    expect(screen.queryByText('Restore Daily Note')).toBeNull();
  });
});
