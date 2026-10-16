// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import type { Page } from '@core/vault/models/Page';

/**
 * A Daily Note carries an emoji through the same frontmatter `icon` a Note's does: the page title
 * section shows it, opens the shared picker to change or remove it, and the write keeps every
 * other property and the note's date identity.
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

const titleRoot = () => document.querySelector<HTMLElement>('.page-title')!;
const editableControlsInTitle = () =>
  titleRoot().querySelectorAll('[contenteditable], [role="textbox"], input, textarea');

const PATH = DailyNotePath.absoluteFrom(ROOT, DATE);

async function openSavedDailyNote(frontmatter: Record<string, unknown> = {}) {
  const fileSystem = new InMemoryVaultFileSystem();
  const page = buildPage(PATH, `daily-${ISO}`, frontmatter);
  const application = makeApplication([page], fileSystem);
  await application.pageOperations.open(page.id);
  return { application, fileSystem, page };
}

const moreActions = () =>
  within(document.querySelector<HTMLElement>('.page-header-controls')!).getByRole('button', { name: 'More actions' });
const emojiButton = () => screen.queryByRole('button', { name: 'Change emoji' });
const savedFrontmatter = async (fileSystem: InMemoryVaultFileSystem) =>
  new FrontmatterParser().parse(await fileSystem.readFile(PATH)).frontmatter;

describe('Daily Note page title — emoji', () => {
  it('shows the stored emoji in the title section, as a Note does', async () => {
    const { application } = await openSavedDailyNote({ icon: '🍄' });
    render(<AppLayout application={application} />);
    await flush();

    expect(emojiButton()).toHaveTextContent('🍄');
    expect(titleRoot().textContent).toMatch(/15 January 2026/);
  });

  it('without an emoji it shows no emoji control, but offers Change icon in More actions', async () => {
    const { application } = await openSavedDailyNote();
    render(<AppLayout application={application} />);
    await flush();

    expect(emojiButton()).toBeNull();
    fireEvent.click(moreActions());
    expect(screen.getByText('Change icon')).toBeInTheDocument();
  });

  it('picking an emoji from More actions writes frontmatter `icon`, keeps other properties, and updates the title immediately', async () => {
    const { application, fileSystem, page } = await openSavedDailyNote({ description: 'Standup notes' });
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(moreActions());
    fireEvent.click(screen.getByText('Change icon'));
    fireEvent.click(screen.getByRole('button', { name: 'grinning face' }));
    await flush();

    expect(emojiButton()).toHaveTextContent('😀');
    const frontmatter = await savedFrontmatter(fileSystem);
    expect(frontmatter.icon).toBe('😀');
    expect(frontmatter.description).toBe('Standup notes');
    expect(frontmatter.id).toBe(page.id);
    // The date identity is untouched: same page, same name/type/path, same date title.
    const after = application.vault.getPage(page.id)!;
    expect(after.name).toBe(ISO);
    expect(after.type).toBe('daily-note');
    expect(after.path).toBe(PATH);
    expect(titleRoot().textContent).toMatch(/15 January 2026/);
    expect(editableControlsInTitle()).toHaveLength(0);
  });

  it('clicking the emoji changes it to a different one', async () => {
    const { application, fileSystem } = await openSavedDailyNote({ icon: '🍄' });
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(emojiButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'grinning face' }));
    await flush();

    expect(emojiButton()).toHaveTextContent('😀');
    expect((await savedFrontmatter(fileSystem)).icon).toBe('😀');
  });

  it('removing the emoji restores the default title and drops `icon`, keeping other properties', async () => {
    const { application, fileSystem } = await openSavedDailyNote({ icon: '🍄', description: 'Standup notes' });
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(emojiButton()!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove icon' }));
    await flush();

    expect(emojiButton()).toBeNull();
    const frontmatter = await savedFrontmatter(fileSystem);
    expect(frontmatter.icon).toBeUndefined();
    expect(frontmatter.description).toBe('Standup notes');
  });

  it('the emoji survives switching to another note and back, and reopening from the saved file', async () => {
    const { application, page } = await openSavedDailyNote({ icon: '🍄' });
    const other = buildPage(`${ROOT}/Other.md`, 'note-other');
    application.vault.addPage(other);
    render(<AppLayout application={application} />);
    await flush();

    await act(async () => {
      await application.pageOperations.open(other.id);
    });
    await flush();
    expect(emojiButton()).toBeNull();

    await act(async () => {
      await application.pageOperations.open(page.id);
    });
    await flush();
    expect(emojiButton()).toHaveTextContent('🍄');

  });

  it('an emoji written through the title section is read back by a fresh load of the saved file', async () => {
    const { application, fileSystem, page } = await openSavedDailyNote();
    render(<AppLayout application={application} />);
    await flush();
    fireEvent.click(moreActions());
    fireEvent.click(screen.getByText('Change icon'));
    fireEvent.click(screen.getByRole('button', { name: 'grinning face' }));
    await flush();
    cleanup();

    // "Restart": a fresh Application built from the frontmatter that is now on disk.
    const reopened = buildPage(PATH, page.id, await savedFrontmatter(fileSystem));
    const restarted = makeApplication([reopened]);
    await restarted.pageOperations.open(reopened.id);
    render(<AppLayout application={restarted} />);
    await flush();

    expect(emojiButton()).toHaveTextContent('😀');
  });
});
