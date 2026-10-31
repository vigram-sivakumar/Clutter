// @vitest-environment jsdom

// Rename and Change icon in a Collection View item's right-click menu — through the real Application, the real
// Sidebar and the real page. Nothing is mocked but the browser's layout.
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
  convertFileSrc: (path: string) => `app://${path}`,
}));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const ROOT = '/vault';
let application: Application;
let fileSystem: InMemoryVaultFileSystem;
const ids: Record<string, string> = {};

/** Folders and notes made through the real operations (real ids, directories and files). */
async function build(folders: Array<[string, string | null]>, notes: Array<[string, string]> = []) {
  fileSystem = new InMemoryVaultFileSystem();
  const vault = new Vault(ROOT, [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  application = new Application(vault, fileSystem, new SelfWriteRegistry(), undefined, undefined, CollectionViewConfigStore.empty(fileSystem, ROOT));
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  for (const [name, parent] of folders) {
    ids[name] = await application.folderOperations.create(name, parent === null ? null : ids[parent]!);
  }
  for (const [title, folder] of notes) {
    ids[title] = await application.pageOperations.create({ folderId: ids[folder]!, title });
  }
}

async function show(folderName: string) {
  cleanup();
  render(<AppLayout application={application} />);
  fireEvent.click(screen.getByTestId('sidebar.tab.notes'));
  await act(async () => {
    await application.folderOperations.open(ids[folderName]!);
  });
}

beforeEach(() => {
  // Sidebar rows (.entry) stack down the left from y=100; Collection View entries stack down the right.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const zero = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect;
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

    if (el.classList.contains('entry') && !el.closest('.drag-ghost')) {
      const rows = Array.from(document.querySelectorAll('.entry')).filter((row) => !row.closest('.drag-ghost'));
      return rect(12, 100 + Math.max(0, rows.indexOf(el)) * 28, 236, 28);
    }
    if (el.classList.contains('view--content')) {
      return rect(0, 100, 260, 600); // the sidebar's scrolling area (made scrollable by the tests that need it)
    }
    if (el.dataset?.dragInsideOnly === 'true') {
      const cards = Array.from(document.querySelectorAll('[data-drag-inside-only="true"]'));
      return rect(400, 100 + Math.max(0, cards.indexOf(el)) * 60, 300, 40);
    }
    return zero;
  });
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

/** A Collection View entry (a folder card or a note row) of the page. */
const card = (id: string) => document.querySelector<HTMLElement>(`[data-drag-inside-only="true"][data-drag-id="${id}"]`)!;

const checkbox = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}`, hidden: true });
const select = (...names: string[]) => names.forEach((name) => fireEvent.click(checkbox(name)));

const rightClick = (id: string) => {
  const entry = card(id);
  fireEvent.contextMenu(entry, { clientX: 500, clientY: 300 });
};
const menuLabels = () => [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());
const chooseFromMenu = (label: string) =>
  fireEvent.click([...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === label)!);
const dialog = () => document.querySelector<HTMLElement>('.new-folder');
const nameField = () => document.querySelector<HTMLInputElement>('.new-folder input')!;
const descriptionField = () => document.querySelector<HTMLTextAreaElement>('.new-folder textarea');
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
const save = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await settle();
};
const collectionText = () => entries().map((el) => el.textContent).join('|');
const entries = () => [...document.querySelectorAll<HTMLElement>('[data-drag-inside-only="true"]')];
const sidebarText = () => [...document.querySelectorAll<HTMLElement>('.entry')].map((el) => el.textContent).join('|');

describe('Rename and Change icon in a collection item\'s right-click menu', () => {
  // Projects: folders Alpha, Beta; notes N1, N2, N3.
  beforeEach(async () => {
    await build([['Projects', null], ['Alpha', 'Projects'], ['Beta', 'Projects'], ['Gamma', null]], [['N1', 'Projects'], ['N2', 'Projects'], ['N3', 'Projects']]);
    await show('Projects');
  });

  it('a folder\'s menu offers Rename and Change icon first, in the identity group', () => {
    rightClick(ids.Alpha!);

    expect(menuLabels().slice(0, 2)).toEqual(['Rename', 'Change icon']);
  });

  it('Rename opens the shared name dialog with the folder\'s values, the name field focused, and saves through FolderOperations', async () => {
    await application.folderOperations.updateMetadata(ids.Alpha!, { description: 'First', icon: '📁' });
    rightClick(ids.Alpha!);
    chooseFromMenu('Rename');

    expect(dialog()).not.toBeNull();
    expect(screen.getByText('Rename folder')).toBeInTheDocument();
    expect(nameField().value).toBe('Alpha');
    expect(descriptionField()!.value).toBe('First');
    expect(document.activeElement).toBe(nameField());
    expect(document.querySelector('.new-folder__emoji')?.textContent).toBe('📁'); // the current emoji

    type(nameField(), 'Alpine');
    type(descriptionField()!, 'Renamed');
    const create = vi.spyOn(application.folderOperations, 'create');
    await save();

    const folder = application.vault.getFolder(ids.Alpha!)!;
    expect(folder.name).toBe('Alpine');
    expect(folder.id).toBe(ids.Alpha); // the same folder: nothing new is created
    expect(folder.metadata.description).toBe('Renamed');
    expect(folder.metadata.icon).toBe('📁'); // untouched
    expect(create).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
    expect(collectionText()).toContain('Alpine'); // the page and the sidebar show it at once
    expect(sidebarText()).toContain('Alpine');
  });

  it('Rename on a note changes its title through PageOperations, keeping its other metadata', async () => {
    await application.pageOperations.updateMetadata(ids.N2!, { favorite: true, description: 'Keep me' });
    rightClick(ids.N2!);
    chooseFromMenu('Rename');

    expect(screen.getByText('Rename note')).toBeInTheDocument();
    expect(nameField().value).toBe('N2');
    type(nameField(), 'Second');
    await save();

    const page = application.vault.getPage(ids.N2!)!;
    expect(page.name).toBe('Second');
    expect(page.id).toBe(ids.N2);
    expect(page.metadata.favorite).toBe(true); // unrelated metadata untouched
    expect(page.metadata.description).toBe('Keep me'); // description unchanged: never rewritten
    expect(collectionText()).toContain('Second');
  });

  it('Enter confirms and Escape cancels, changing nothing', async () => {
    rightClick(ids.Alpha!);
    chooseFromMenu('Rename');
    type(nameField(), 'Never saved');
    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();

    expect(dialog()).toBeNull();
    expect(application.vault.getFolder(ids.Alpha!)!.name).toBe('Alpha');

    rightClick(ids.Alpha!);
    chooseFromMenu('Rename');
    type(nameField(), 'Via Enter');
    fireEvent.submit(nameField().closest('form')!);
    await settle();
    expect(application.vault.getFolder(ids.Alpha!)!.name).toBe('Via Enter');
  });

  it('Cancel leaves the item exactly as it was', async () => {
    const before = JSON.stringify(application.vault.getFolder(ids.Alpha!));
    rightClick(ids.Alpha!);
    chooseFromMenu('Rename');
    type(nameField(), 'Changed');
    type(descriptionField()!, 'Changed too');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();

    expect(dialog()).toBeNull();
    expect(JSON.stringify(application.vault.getFolder(ids.Alpha!))).toBe(before);
  });

  it('a name that is already taken is refused in the dialog — folder (pre-checked) and note (the operation\'s own rejection)', async () => {
    rightClick(ids.Beta!);
    chooseFromMenu('Rename');
    type(nameField(), 'Alpha');
    expect(screen.getByRole('alert')).toHaveTextContent('Folder name already exists');
    await save();
    expect(application.vault.getFolder(ids.Beta!)!.name).toBe('Beta');
    expect(dialog()).not.toBeNull(); // stays open
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle();

    rightClick(ids.N2!);
    chooseFromMenu('Rename');
    type(nameField(), 'N1');
    await save();
    expect(application.vault.getPage(ids.N2!)!.name).toBe('N2');
    expect(dialog()).not.toBeNull();
    expect(document.querySelector('.new-folder__error')?.textContent).toMatch(/already exists/);
  });

  it('a rename the operation rejects shows its error and nothing changes', async () => {
    vi.spyOn(application.folderOperations, 'rename').mockRejectedValue(new Error('Cannot rename right now'));
    rightClick(ids.Alpha!);
    chooseFromMenu('Rename');
    type(nameField(), 'Other');

    await save();

    expect(document.querySelector('.new-folder__error')?.textContent).toBe('Cannot rename right now');
    expect(application.vault.getFolder(ids.Alpha!)!.name).toBe('Alpha');
  });

  it('Change icon opens the shared emoji picker, and picking one sets it (nothing else changes) — visible in the collection and the sidebar', async () => {
    const before = application.vault.getFolder(ids.Alpha!)!;
    rightClick(ids.Alpha!);
    chooseFromMenu('Change icon');

    const emoji = await screen.findAllByRole('button', { name: /grinning|smile|😀/i });
    fireEvent.click(emoji[0]!);
    await settle();

    const folder = application.vault.getFolder(ids.Alpha!)!;
    expect(folder.metadata.icon).toBeTruthy();
    expect(folder.name).toBe(before.name);
    expect(folder.metadata.description).toBe(before.metadata.description);
    expect(card(ids.Alpha!).textContent).toContain(folder.metadata.icon!);
    expect(sidebarText()).toContain(folder.metadata.icon!);
  });

  it('a note\'s Change icon writes through PageOperations.updateMetadata', async () => {
    const update = vi.spyOn(application.pageOperations, 'updateMetadata');
    rightClick(ids.N1!);
    chooseFromMenu('Change icon');
    const emoji = await screen.findAllByRole('button', { name: /grinning|smile|😀/i });
    fireEvent.click(emoji[0]!);
    await settle();

    expect(update).toHaveBeenCalledWith(ids.N1, expect.objectContaining({ icon: expect.any(String) }));
    expect(application.vault.getPage(ids.N1!)!.metadata.icon).toBeTruthy();
  });

  it('several selected items: the selection\'s menu has neither Rename nor Change icon (they act on one item)', () => {
    select('N1', 'N2');

    rightClick(ids.N1!);

    expect(menuLabels()).not.toContain('Rename');
    expect(menuLabels()).not.toContain('Change icon');
  });

  it('in selection mode a right-click anywhere opens the selection\'s menu — no Rename, no Change icon', () => {
    select('N1', 'N2');

    rightClick(ids.Alpha!);

    expect(menuLabels()).not.toContain('Rename');
    expect(menuLabels()).not.toContain('Change icon');
  });

  it('the dialog acts on the right-clicked item only, and leaves the rest of the collection as it was', async () => {
    rightClick(ids.Alpha!);
    chooseFromMenu('Rename');
    expect(nameField().value).toBe('Alpha');
    type(nameField(), 'Alone');
    await save();

    expect(application.vault.getFolder(ids.Alpha!)!.name).toBe('Alone');
    expect(['N1', 'N2', 'N3'].map((name) => application.vault.getPage(ids[name]!)!.name)).toEqual(['N1', 'N2', 'N3']);
    expect(application.vault.getFolder(ids.Beta!)!.name).toBe('Beta');
  });
});
