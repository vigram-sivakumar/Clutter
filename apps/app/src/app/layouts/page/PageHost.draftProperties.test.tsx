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
import { FolderBuilder } from '@core/vault/ingest/FolderBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Folder } from '@core/vault/models/Folder';

import { readCustomProperties } from '@core/vault/ingest/frontmatter/customFrontmatter';
import { readListedSystemProperties } from '@core/vault/ingest/frontmatter/propertyVisibility';

/**
 * Properties on a draft (a note with no file yet): the control is offered, but only a property
 * actually written creates the file. Through the real AppLayout composition.
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
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderDraft(options: { title?: string; body?: string } = {}) {
  const application = makeApplication();
  const id = await application.pageOperations.openDraft({ folderId: null, title: options.title });
  if (options.body) {
    application.pageOperations.commitEdit(id, options.body);
  }
  const create = vi.spyOn(application.pageOperations, 'addCustomProperty');
  render(<AppLayout application={application} />);
  await flush();
  const pageExists = () => application.vault.getPage(id) !== undefined;
  return { application, id, create, pageExists };
}

const titleMenuButton = () => document.querySelector<HTMLElement>('button[aria-label="More actions"]')!;
const menuItems = () => Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent);
const clickMenuItem = (label: string) =>
  fireEvent.click(Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent === label)!);

/** Title menu → Properties: the (empty) section appears with its picker open. */
async function openProperties() {
  fireEvent.click(titleMenuButton());
  await flush();
  clickMenuItem('Properties');
  await flush();
}

describe('Properties on a draft', () => {
  it('the title menu offers Properties on a draft, and opening it creates no file', async () => {
    const { application, id, pageExists } = await renderDraft();

    fireEvent.click(titleMenuButton());
    await flush();
    expect(menuItems()).toContain('Properties');
    clickMenuItem('Properties');
    await flush();

    expect(menuItems()).toEqual(expect.arrayContaining(['Tags', 'Text']));
    expect(pageExists()).toBe(false);
    expect(application.pageOperations.getDraft(id)).toBeDefined();
  });

  it('Escape in the picker creates no file', async () => {
    const { application, id, pageExists } = await renderDraft();
    await openProperties();

    fireEvent.keyDown(screen.getByRole('menu', { name: 'Add properties' }), { key: 'Escape' });
    await flush();

    expect(pageExists()).toBe(false);
    expect(application.pageOperations.getDraft(id)).toBeDefined();
  });

  it('choosing a type and abandoning the unnamed property creates no file', async () => {
    const { pageExists, create } = await renderDraft();
    await openProperties();

    clickMenuItem('Text'); // an unnamed row waits for a name
    await flush();
    const field = document.querySelector<HTMLElement>('.property-list__name .editable-text')!;
    fireEvent.keyDown(field, { key: 'Escape' });
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(pageExists()).toBe(false);
  });

  it('listing a system property writes it and the draft becomes a saved page — same id, one file', async () => {
    const { application, id, pageExists } = await renderDraft();
    await openProperties();

    clickMenuItem('Tags');
    await flush();

    expect(pageExists()).toBe(true);
    expect(application.pageOperations.getDraft(id)).toBeUndefined();
    const page = application.vault.getPage(id)!;
    expect(readListedSystemProperties(page.metadata.unownedFrontmatter ?? [])).toEqual(['tags']);
    // Ordinary saved page now: the section is on screen, and the title no longer offers Properties.
    expect(document.querySelector('.property-list')).not.toBeNull();
    fireEvent.click(titleMenuButton());
    await flush();
    expect(menuItems()).not.toContain('Properties');
  });

  it('a named custom property materializes the draft with its title and content preserved, then further edits are ordinary saves', async () => {
    const { application, id, pageExists } = await renderDraft({ title: 'Trip plan', body: 'Pack light' });
    await openProperties();

    clickMenuItem('Text');
    await flush();
    const field = document.querySelector<HTMLElement>('.property-list__name .editable-text')!;
    field.textContent = 'owner';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });
    await flush();

    expect(pageExists()).toBe(true);
    const page = application.vault.getPage(id)!;
    expect(page.path).toBe(`${ROOT}/Trip plan.md`);
    expect(page.source.markdown).toBe('Pack light');
    expect(readCustomProperties(page.metadata.unownedFrontmatter ?? []).map((property) => property.key)).toEqual(['owner']);

    // A second property goes through the saved page: same file, same id.
    await application.pageOperations.addCustomProperty(id, 'status2', { type: 'text', value: null });
    const again = application.vault.getPage(id)!;
    expect(again.path).toBe(page.path);
    expect(readCustomProperties(again.metadata.unownedFrontmatter ?? []).map((property) => property.key)).toEqual([
      'owner',
      'status2',
    ]);
  });
});
