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
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import { ToastProvider } from '@components/toast/ToastProvider';
import { archivePageWithUndo } from '@features/notes/helpers/archiveWithUndo';

/**
 * The archive toast names what was archived — checked through the real AppLayout composition, by the same
 * interaction a user makes: the Notes sidebar row's menu for a note that is not the open one.
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

function makeApplication() {
  const inbox = folder(`${ROOT}/Inbox`, null);
  const archive = folder(`${ROOT}/Archive`, null);
  const work = folder(`${ROOT}/Work`, null);
  const meeting = buildPage(`${ROOT}/Inbox/Meeting notes.md`, 'meeting', 'Agenda', inbox.id);
  const other = buildPage(`${ROOT}/Inbox/Other.md`, 'other', 'Something else', inbox.id);
  const untitled = buildPage(`${ROOT}/Inbox/Untitled.md`, 'untitled', 'Body', inbox.id);
  const vault = new Vault(
    ROOT,
    [meeting, other, untitled],
    [inbox, archive, work],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const fileSystem = new InMemoryVaultFileSystem();
  for (const page of [meeting, other, untitled]) {
    fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  }
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return { application, meeting, other, untitled, inbox };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Right-clicks the entry in the open collection list and chooses Move to trash (Archive). */
async function archiveFromList(shownName: string) {
  fireEvent.contextMenu(screen.getByText(shownName));
  await flush();
  fireEvent.click(
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent === 'Move to trash'
    )!
  );
  await flush();
}

describe('the archive toast names the archived note', () => {
  it('says Meeting notes archived when its row is archived from the Notes sidebar', async () => {
    const { application, meeting } = makeApplication();
    // Looking at the Inbox's list, so the note being archived is not the open one.
    application.navigation.openInbox();
    render(
      <ToastProvider>
        <AppLayout application={application} />
      </ToastProvider>
    );
    await flush();

    await archiveFromList('Meeting notes');

    expect(screen.getByRole('status')).toHaveTextContent('Meeting notes archived');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(application.vault.getPage(meeting.id)!.path).toContain('/Archive/');
  });

  it('names a note whose title was typed and then left for the list (the save has landed)', async () => {
    const { application, untitled } = makeApplication();
    // The note is "Untitled" on disk; the user types its title, then leaves the note for the list.
    await application.pageOperations.open(untitled.id);
    application.pageOperations.commitTitle(untitled.id, 'Quarterly review');
    application.navigation.openInbox();
    render(
      <ToastProvider>
        <AppLayout application={application} />
      </ToastProvider>
    );
    await flush();

    await archiveFromList('Quarterly review');

    expect(screen.getByRole('status')).toHaveTextContent('Quarterly review archived');
    expect(screen.getByRole('status')).not.toHaveTextContent('Note archived');
  });

  it('falls back to Note archived only for a note that really is untitled', async () => {
    const { application } = makeApplication();
    application.navigation.openInbox();
    render(
      <ToastProvider>
        <AppLayout application={application} />
      </ToastProvider>
    );
    await flush();

    await archiveFromList('New note');

    expect(screen.getByRole('status')).toHaveTextContent(/^Note archived/);
  });

  it('names a note whose title is typed but not saved yet — the vault still holds "Untitled"', async () => {
    const { application, untitled } = makeApplication();
    // The page is open and its title edit is committed (what the user sees) but not written to disk: the
    // title saves on a debounce, so the vault still has the auto-generated name. Root cause of the
    // fallback: the name was read before the archive, whose own flush is what saves the typed title.
    await application.pageOperations.open(untitled.id);
    application.pageOperations.commitTitle(untitled.id, 'Quarterly review');
    expect(application.vault.getPage(untitled.id)!.name).toBe('Untitled');
    const shown: string[] = [];
    const toast = {
      show: (input: { text: string }) => (shown.push(input.text), 1),
      fail: () => 1,
      dismiss: () => {},
    };

    await archivePageWithUndo(
      {
        vault: application.vault,
        pageOperations: application.pageOperations,
        toast,
      },
      untitled.id
    );

    expect(shown).toEqual(['Quarterly review archived']);
  });
});
