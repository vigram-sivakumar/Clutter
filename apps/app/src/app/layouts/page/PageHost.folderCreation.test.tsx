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
import { FolderBuilder } from '@core/vault/ingest/FolderBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Folder } from '@core/vault/models/Folder';

/**
 * Creating a folder from a collection opens the one New folder dialog (name, icon, description) —
 * the same one the sidebar uses — and nothing is created until it is submitted. No inline card.
 * Through the real AppLayout composition.
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

function makeApplication(): Application {
  const vault = new Vault(
    ROOT,
    [],
    [folder(`${ROOT}/Projects`, null)],
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

async function renderProjects() {
  const application = makeApplication();
  const create = vi.spyOn(application.folderOperations, 'create');
  await application.folderOperations.open(`${ROOT}/Projects`);
  render(<AppLayout application={application} />);
  await flush();
  return { application, create };
}

/** Header caret → the Add menu's "New folder": the New folder dialog opens. */
async function startCreatingFolder(): Promise<HTMLInputElement> {
  fireEvent.click(document.querySelector('button[aria-label="Add options"]')!);
  await flush();
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (entry) => entry.textContent === 'New folder'
  );
  fireEvent.click(item!);
  await flush();
  return document.querySelector<HTMLInputElement>('input[aria-label="Folder name"]')!;
}

const submit = async () => {
  fireEvent.click(document.querySelector<HTMLElement>('.new-folder__create-button')!);
  await flush();
};
const type = (field: HTMLInputElement, text: string) => fireEvent.change(field, { target: { value: text } });
const hasInlineCard = () => document.querySelector('.collection-grid--fixed-rows [role="textbox"]') !== null;

describe('creating a folder from a collection', () => {
  it('opens the existing New folder dialog, with no inline card, and creates nothing yet', async () => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    expect(field).not.toBeNull();
    expect(document.querySelector('.new-folder__title')?.textContent).toBe('New folder');
    expect(document.querySelector('textarea[aria-label="Description"], [aria-label="Description"]')).not.toBeNull();
    expect(document.querySelector('.new-folder__emoji-button')).not.toBeNull();
    expect(hasInlineCard()).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the folder in the collection being viewed with the typed name, description, and closes', async () => {
    const { application, create } = await renderProjects();
    const field = await startCreatingFolder();
    const update = vi.spyOn(application.folderOperations, 'updateMetadata');

    type(field, 'Trips');
    fireEvent.change(document.querySelector<HTMLInputElement>('[aria-label="Description"]')!, {
      target: { value: 'Holiday plans' },
    });
    await submit();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('Trips', `${ROOT}/Projects`);
    expect(update).toHaveBeenCalledWith(expect.any(String), { description: 'Holiday plans' });
    expect(document.querySelector('.new-folder')).toBeNull();
  });

  it('cancelling (Close) creates no folder', async () => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    type(field, 'Trips');
    fireEvent.click(document.querySelector<HTMLElement>('.new-folder button[aria-label="Close"]')!);
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector('.new-folder')).toBeNull();
  });

  it('Create with an empty name creates nothing, shakes the name input and keeps the dialog open', async () => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    await submit();

    expect(create).not.toHaveBeenCalled();
    expect(field).toHaveClass('editable-text--shake');
    expect(document.querySelector('.new-folder')).not.toBeNull();
  });

  it('a duplicate name shows the dialog\'s error and cannot be submitted', async () => {
    const { application, create } = await renderProjects();
    await application.folderOperations.create('Trips', `${ROOT}/Projects`);
    create.mockClear();
    const field = await startCreatingFolder();

    type(field, 'Trips');
    await flush();

    expect(document.querySelector('.new-folder__error')?.textContent).toContain('already exists');
    expect(document.querySelector<HTMLButtonElement>('.new-folder__create-button')!.disabled).toBe(false);
    await submit();
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['a/b', 'a:b', '..', '.hidden', 'a\\b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b'])('rejects the name "%s": nothing is created and the dialog stays open with an error', async (name) => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    type(field, name);
    await submit();

    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector('.new-folder')).not.toBeNull();
    expect(document.querySelector('.new-folder__error')?.textContent).toContain('A folder name can');
  });
});
