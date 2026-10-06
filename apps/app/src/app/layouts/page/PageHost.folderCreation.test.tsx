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
 * Creating a folder is inline: the page shows a card with an empty, focused name field ("New Folder"
 * as its placeholder only), and nothing is created until the name is committed. Through the real
 * AppLayout composition.
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

/** Header "+" → the Add menu's "New folder": the inline name field appears. */
async function startCreatingFolder(): Promise<HTMLElement> {
  fireEvent.click(document.querySelector('button[aria-label="New"]')!);
  await flush();
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
    (entry) => entry.textContent === 'New folder'
  );
  fireEvent.click(item!);
  await flush();
  return document.querySelector<HTMLElement>('.collection-grid--fixed-rows [role="textbox"]')!;
}

function type(field: HTMLElement, text: string) {
  field.textContent = text;
  fireEvent.input(field);
}

describe('creating a folder inline', () => {
  it('shows a focused, empty name field with "New Folder" as its placeholder, and creates nothing yet', async () => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    expect(field).not.toBeNull();
    expect(document.activeElement).toBe(field);
    expect(field.textContent).toBe('');
    expect(field.getAttribute('data-placeholder')).toBe('New Folder');
    expect(create).not.toHaveBeenCalled();
  });

  it('persists the typed name', async () => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    type(field, 'Trips');
    fireEvent.keyDown(field, { key: 'Enter' });
    await flush();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('Trips', `${ROOT}/Projects`);
  });

  it('commits an empty field as "New Folder"', async () => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    fireEvent.keyDown(field, { key: 'Enter' });
    await flush();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('New Folder', `${ROOT}/Projects`);
  });

  it('cancelling (Escape) creates no folder and removes the field', async () => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    type(field, 'Trips');
    fireEvent.keyDown(field, { key: 'Escape' });
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector('.collection-grid--fixed-rows [role="textbox"]')).toBeNull();
  });

  it.each(['a/b', 'a:b', '..', '.hidden', 'a\\b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b'])('rejects the name "%s" (a character a folder name may not have): the field stays open', async (name) => {
    const { create } = await renderProjects();
    const field = await startCreatingFolder();

    type(field, name);
    fireEvent.keyDown(field, { key: 'Enter' });
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector('.collection-grid--fixed-rows [role="textbox"]')).not.toBeNull();
  });

  it('clicking outside cancels too — empty or typed — and creates no folder', async () => {
    const { create } = await renderProjects();
    let field = await startCreatingFolder();
    fireEvent.blur(field);
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector('.collection-grid--fixed-rows [role="textbox"]')).toBeNull();

    field = await startCreatingFolder();
    type(field, 'Trips');
    fireEvent.blur(field);
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector('.collection-grid--fixed-rows [role="textbox"]')).toBeNull();
  });
});
