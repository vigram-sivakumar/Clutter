// @vitest-environment jsdom

// Folder drag-and-drop through the REAL wiring: the real Application (real FolderOperations, Gate, store and
// ids), the real Sidebar and its rowActions — nothing mocked but the browser's layout, which jsdom lacks.
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
const ROW = { left: 12, top: 100, width: 236, height: 28 };

let application: Application;
let fileSystem: InMemoryVaultFileSystem;
const ids: Record<string, string> = {};

/** Creates the folders through the real operation, so they have real ids, directories and `.folder.md` files. */
async function build(tree: Array<[name: string, parent: string | null]>, notes: Array<[title: string, folder: string]> = [], manual = true, prepare?: () => void) {
  fileSystem = new InMemoryVaultFileSystem();
  const vault = new Vault(ROOT, [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  // (A directly constructed Application gets throw-away stores rooted at ''; the real one is bootstrapped with a loaded store.)
  application = new Application(vault, fileSystem, new SelfWriteRegistry(), undefined, undefined, CollectionViewConfigStore.empty(fileSystem, ROOT));
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  for (const [name, parent] of tree) {
    ids[name] = await application.folderOperations.create(name, parent === null ? null : ids[parent]!);
  }
  for (const [title, folder] of notes) {
    ids[title] = await application.pageOperations.create({ folderId: ids[folder]!, title });
  }
  // Positions are only offered in a level ordered by hand: put every folder's children in Manual mode.
  if (manual) {
    for (const folder of application.vault.folders()) {
      application.collectionViewConfigStore.update(`folder:${folder.id}`, { sidebarSort: { key: 'manual', direction: 'down' } });
    }
    application.collectionViewConfigStore.update('sidebar:root', { sidebarSort: { key: 'manual', direction: 'down' } });
  }
  prepare?.();
  render(<AppLayout application={application} />);
  fireEvent.click(screen.getByTestId('sidebar.tab.notes'));
}

beforeEach(() => {
  // The tree indents a row by --space-6 + 24px per level; jsdom has no stylesheet, so the formula stands in for it.
  const realComputedStyle = globalThis.getComputedStyle.bind(globalThis);
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
    const real = realComputedStyle(element, pseudo);
    const indent = `${6 + 24 * (Number((element as HTMLElement).style?.getPropertyValue?.('--tree-level')) || 0)}px`;
    // Everything is the real thing except the row indent the stylesheet (absent in jsdom) would give.
    return new Proxy(real, {
      get: (target, key) => {
        if (key === 'paddingLeft') return indent;
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (!this.classList.contains('entry')) {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect;
    }
    const rows = Array.from(document.querySelectorAll('.entry')).filter((row) => !row.closest('.drag-ghost'));
    const top = ROW.top + Math.max(0, rows.indexOf(this)) * ROW.height;
    return { left: ROW.left, top, width: ROW.width, height: ROW.height, right: ROW.left + ROW.width, bottom: top + ROW.height, x: ROW.left, y: top } as DOMRect;
  });
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
});

const titleRows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.entry'))
    .filter((row) => !row.closest('.drag-ghost') && row.dataset.dragKind === 'folder')
    .map((row) => row.querySelector('.folder__title')?.textContent ?? '');

const rowFor = (name: string) => {
  const rows = screen.getAllByText(name).map((el) => el.closest('.entry') as HTMLElement).filter((row) => row && !row.closest('.drag-ghost'));
  expect(rows).toHaveLength(1);
  return rows[0]!;
};

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const feedback = () => Array.from(document.body.querySelectorAll<HTMLElement>('[data-drop-feedback]'));

/** Press on the row's title (where a user grabs a row), move to `y`, and optionally release there. */
async function drag(name: string, y: number, options: { release?: boolean; x?: number } = {}) {
  const row = rowFor(name);
  const title = row.querySelector('.folder__title') ?? row.querySelector('.entry__content')!;
  const top = row.getBoundingClientRect().top;
  fireEvent.pointerDown(title, { button: 0, pointerId: 1, isPrimary: true, clientX: 60, clientY: top + 14 });
  act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: options.x ?? 60, clientY: y }));
  if (options.release !== false) {
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: options.x ?? 60, clientY: y }));
    await settle();
  }
}

/** A viewport y on `name`'s row: its top edge, middle, or bottom edge (the bands the drop target is read from). */
const on = (name: string, where: 'top' | 'middle' | 'bottom') =>
  rowFor(name).getBoundingClientRect().top + ROW.height * { top: 0.08, middle: 0.5, bottom: 0.92 }[where];

const parentOf = (name: string) => application.vault.getFolder(ids[name]!)?.parentId;

describe('folder drag-and-drop, end to end (real Application, real Sidebar)', () => {
  // Rows from y=100 (28px): Alpha 100, Inner 128, Deep 156, Beta 184, Gamma 212 — Alpha and Inner expanded.
  beforeEach(async () => {
    await build([
      ['Alpha', null],
      ['Inner', 'Alpha'],
      ['Deep', 'Inner'],
      ['Beta', null],
      ['Gamma', null],
    ]);
  });

  it('the rows are what these tests assume', () => {
    expect(titleRows()).toEqual(['Alpha', 'Inner', 'Deep', 'Beta', 'Gamma']);
  });

  it('shows a destination highlight for a folder over another folder\'s middle', async () => {
    await drag('Gamma', on('Beta', 'middle'), { release: false });
    expect(feedback()).toHaveLength(1);
    expect(feedback()[0]).toHaveAttribute('data-drop-feedback', 'inside');
  });

  it('moves a folder INTO an empty folder', async () => {
    await drag('Gamma', on('Beta', 'middle'));
    expect(parentOf('Gamma')).toBe(ids.Beta);
    expect(application.vault.getFolder(ids.Gamma!)!.path).toBe(`${ROOT}/Beta/Gamma`);
  });

  it('moves a nested folder into a different parent', async () => {
    await drag('Deep', on('Beta', 'middle'));
    expect(parentOf('Deep')).toBe(ids.Beta);
  });

  it('moves a nested folder to the root: before a root folder', async () => {
    await drag('Deep', on('Gamma', 'top')); // Gamma's top edge
    expect(parentOf('Deep')).toBeNull();
    expect(application.vault.getFolder(ids.Deep!)!.path).toBe(`${ROOT}/Deep`);
  });

  it('moves a nested folder to the root without collapsing its parent, using the end of the parent\'s subtree', async () => {
    // Deep is the last row of Inner's and Alpha's subtrees: the position after Alpha is at their end.
    const deepBottom = on('Deep', 'bottom');
    await drag('Deep', deepBottom, { release: false, x: 14 }); // Deep's own bottom edge, left of every indent
    expect(feedback()[0]).toHaveAttribute('data-drop-feedback', 'insert');
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 14, clientY: deepBottom }));
    await settle();
    expect(parentOf('Deep')).toBeNull();
  });

  it('moves a folder together with its whole subtree', async () => {
    await drag('Alpha', on('Beta', 'middle'));
    expect(parentOf('Alpha')).toBe(ids.Beta);
    expect(application.vault.getFolder(ids.Inner!)!.path).toBe(`${ROOT}/Beta/Alpha/Inner`);
    expect(application.vault.getFolder(ids.Deep!)!.path).toBe(`${ROOT}/Beta/Alpha/Inner/Deep`);
    expect(parentOf('Inner')).toBe(ids.Alpha);
  });

  it('rejects a folder dropped onto itself or one of its descendants', async () => {
    await drag('Alpha', on('Alpha', 'middle'), { release: false }); // itself
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: on('Inner', 'middle') })); // Inner's middle
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: on('Deep', 'middle') })); // Deep's middle
    expect(feedback()).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: on('Deep', 'middle') }));
    await settle();
    expect(parentOf('Alpha')).toBeNull();
  });

  it('reorders root folders and persists the order across a reload', async () => {
    await drag('Gamma', on('Alpha', 'top')); // before Alpha
    expect(titleRows()[0]).toBe('Gamma');

    const reloaded = await CollectionViewConfigStore.load(fileSystem, ROOT);
    expect(reloaded.get('sidebar:root')?.sidebarOrder).toEqual([`f:${ids.Gamma}`, `f:${ids.Alpha}`, `f:${ids.Beta}`]);
  });
});

describe('folder siblings inside a parent', () => {
  it('reorders child folders within the same parent and persists it', async () => {
    await build([
      ['Alpha', null],
      ['One', 'Alpha'],
      ['Two', 'Alpha'],
      ['Three', 'Alpha'],
    ]);
    // Alpha 100, One 128, Three 156, Two 184 (by name) → drag Two before One.
    expect(titleRows()).toEqual(['Alpha', 'One', 'Three', 'Two']);
    await drag('Two', on('One', 'top'));

    expect(titleRows()).toEqual(['Alpha', 'Two', 'One', 'Three']);
    const reloaded = await CollectionViewConfigStore.load(fileSystem, ROOT);
    expect(reloaded.get(`folder:${ids.Alpha}`)?.sidebarOrder).toEqual([`f:${ids.Two}`, `f:${ids.One}`, `f:${ids.Three}`]);
  });
});


describe('grabbing a folder by its caret / icon', () => {
  beforeEach(async () => {
    await build([
      ['Alpha', null],
      ['Inner', 'Alpha'],
      ['Beta', null],
    ]);
  });

  const caretOf = (name: string) => rowFor(name).querySelector<HTMLElement>('.caret-slot')!;

  it('a plain click on the caret still expands/collapses, and does not open the folder', () => {
    expect(titleRows()).toContain('Inner');
    fireEvent.pointerDown(caretOf('Alpha'), { button: 0, pointerId: 1, isPrimary: true, clientX: 20, clientY: 114 });
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 20, clientY: 114 }));
    fireEvent.click(caretOf('Alpha'));
    expect(titleRows()).not.toContain('Inner');
  });

  it('dragging from the caret — where the folder icon is — drags the folder, and the click that follows toggles nothing', async () => {
    const toggled = titleRows().length;
    fireEvent.pointerDown(caretOf('Inner'), { button: 0, pointerId: 1, isPrimary: true, clientX: 40, clientY: on('Inner', 'middle') });
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: on('Beta', 'middle') }));
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    expect(feedback()[0]).toHaveAttribute('data-drop-feedback', 'inside');

    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: on('Beta', 'middle') }));
    fireEvent.click(caretOf('Beta') ?? document.body);
    await settle();

    expect(parentOf('Inner')).toBe(ids.Beta);
    expect(titleRows().length).toBe(toggled);
  });
});

describe('inserting beside folders', () => {
  beforeEach(async () => {
    await build([
      ['Alpha', null],
      ['Inner', 'Alpha'],
      ['Deep', 'Inner'],
      ['Beta', null],
      ['Gamma', null],
    ]);
  });
  const rootOrder = async () =>
    (await CollectionViewConfigStore.load(fileSystem, ROOT)).get('sidebar:root')?.sidebarOrder;

  it('after a collapsed/leaf folder: Beta goes after Gamma', async () => {
    await drag('Beta', on('Gamma', 'bottom'));
    expect(titleRows()).toEqual(['Alpha', 'Inner', 'Deep', 'Gamma', 'Beta']);
    expect(await rootOrder()).toEqual([`f:${ids.Alpha}`, `f:${ids.Gamma}`, `f:${ids.Beta}`]);
  });

  it('before an expanded folder: Gamma goes before Alpha, and its subtree is untouched', async () => {
    await drag('Gamma', on('Alpha', 'top'));
    expect(titleRows()).toEqual(['Gamma', 'Alpha', 'Inner', 'Deep', 'Beta']);
  });

  it('after an expanded folder: its position is the end of its whole subtree, as a sibling of Alpha', async () => {
    // Deep is the last row of Alpha's subtree: aim at its bottom edge, left of every indent.
    await drag('Gamma', on('Deep', 'bottom'), { x: 14 });
    expect(parentOf('Gamma')).toBeNull();
    expect(titleRows()).toEqual(['Alpha', 'Inner', 'Deep', 'Gamma', 'Beta']);
    expect(await rootOrder()).toEqual([`f:${ids.Alpha}`, `f:${ids.Gamma}`, `f:${ids.Beta}`]);
  });

  it('the header of an expanded folder has no "after", so the subtree end is the only way to put something after it', async () => {
    await drag('Gamma', on('Alpha', 'bottom'), { release: false });
    expect(feedback()).toHaveLength(0);
  });

  it('a folder dragged to the end of its parent\'s subtree lands beside the parent, at the root, with its subtree', async () => {
    await drag('Inner', on('Deep', 'bottom'), { x: 14 }); // the end of Alpha's subtree (Deep is the last row, inside Inner itself)
    expect(parentOf('Inner')).toBeNull();
    expect(parentOf('Deep')).toBe(ids.Inner);
    expect(application.vault.getFolder(ids.Deep!)!.path).toBe(`${ROOT}/Inner/Deep`);
  });
});

describe('notes keep working in the same tree', () => {
  beforeEach(async () => {
    await build(
      [
        ['Alpha', null],
        ['Beta', null],
      ],
      [
        ['Note A', 'Alpha'],
        ['Note B', 'Alpha'],
        ['Note X', 'Beta'],
      ]
    );
  });

  const noteRows = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.entry[data-drag-kind="note"]')).map((row) => row.textContent ?? '');

  it('reorders notes within a folder', async () => {
    const before = noteRows();
    expect(before[0]).toContain('Note A');
    await drag('Note B', on('Note A', 'top'));
    expect(noteRows()[0]).toContain('Note B');
  });

  it('moves a note into another folder', async () => {
    await drag('Note A', on('Beta', 'middle'));
    expect(application.vault.getPage(ids['Note A']!)!.parentId).toBe(ids.Beta);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Manual order interleaves notes and folders in one sequence per parent.
// ---------------------------------------------------------------------------------------------------------

describe('mixed notes and folders in one manual sequence', () => {
  // Projects, hand-arranged to start (the notes, then the folders):
  //   Meeting notes · Project overview · Research notes · Design · Development
  beforeEach(async () => {
    await build(
      [
        ['Projects', null],
        ['Design', 'Projects'],
        ['Development', 'Projects'],
        ['Other', null],
      ],
      [
        ['Meeting notes', 'Projects'],
        ['Project overview', 'Projects'],
        ['Research notes', 'Projects'],
        ['Loose', 'Other'],
      ],
      true,
      () =>
        // Hand-arranged to start: the notes, then the folders.
        application.collectionViewConfigStore.update(`folder:${ids.Projects}`, {
          sidebarOrder: [`n:${ids['Meeting notes']}`, `n:${ids['Project overview']}`, `n:${ids['Research notes']}`, `f:${ids.Design}`, `f:${ids.Development}`],
        })
    );
  });

  /** The titles of Projects' children, in drawn order. */
  const children = () => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.entry[data-drag-id]'));
    const start = rows.findIndex((row) => row.dataset.dragParent === '' && row.textContent?.includes('Projects'));
    return rows
      .slice(start + 1)
      .filter((row) => row.dataset.dragParent === ids.Projects)
      .map((row) => row.querySelector('.folder__title, .entry__content')?.textContent?.trim() ?? '');
  };
  const storedOrder = async () =>
    (await CollectionViewConfigStore.load(fileSystem, ROOT)).get(`folder:${ids.Projects}`)?.sidebarOrder;
  const f = (name: string) => `f:${ids[name]}`;
  const n = (name: string) => `n:${ids[name]}`;

  it('starts as the saved notes-then-folders arrangement', () => {
    expect(children()).toEqual(['Meeting notes', 'Project overview', 'Research notes', 'Design', 'Development']);
  });

  it('a note can go between two folders', async () => {
    await drag('Project overview', on('Design', 'bottom')); // after Design, before Development
    expect(children()).toEqual(['Meeting notes', 'Research notes', 'Design', 'Project overview', 'Development']);
  });

  it('a folder can go between two notes', async () => {
    await drag('Development', on('Research notes', 'top')); // before Research notes
    expect(children()).toEqual(['Meeting notes', 'Project overview', 'Development', 'Research notes', 'Design']);
  });

  it('a note can go before and after a folder; a folder before and after a note', async () => {
    await drag('Meeting notes', on('Design', 'top')); // note before a folder
    expect(children()).toEqual(['Project overview', 'Research notes', 'Meeting notes', 'Design', 'Development']);

    await drag('Meeting notes', on('Development', 'bottom')); // note after a folder
    expect(children()).toEqual(['Project overview', 'Research notes', 'Design', 'Development', 'Meeting notes']);

    await drag('Design', on('Project overview', 'top')); // folder before a note
    expect(children()).toEqual(['Design', 'Project overview', 'Research notes', 'Development', 'Meeting notes']);

    await drag('Design', on('Research notes', 'bottom')); // folder after a note
    expect(children()).toEqual(['Project overview', 'Research notes', 'Design', 'Development', 'Meeting notes']);
  });

  it('holds the exact interleaved order of the example — and persists it and restores it after a restart', async () => {
    await drag('Meeting notes', on('Development', 'bottom'));
    await drag('Design', on('Research notes', 'top'));
    const wanted = ['Project overview', 'Design', 'Research notes', 'Development', 'Meeting notes'];
    expect(children()).toEqual(wanted);
    expect(await storedOrder()).toEqual([n('Project overview'), f('Design'), n('Research notes'), f('Development'), n('Meeting notes')]);

    // A restart: a new Application over the same files, with the store loaded from disk.
    cleanup();
    const loaded = await CollectionViewConfigStore.load(fileSystem, ROOT);
    const vault = application.vault;
    application = new Application(vault, fileSystem, new SelfWriteRegistry(), undefined, undefined, loaded);
    application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
    render(<AppLayout application={application} />);
    fireEvent.click(screen.getByTestId('sidebar.tab.notes'));

    expect(children()).toEqual(wanted);
  });

  it('moving an item between parents puts it exactly where it was dropped in the mixed sequence', async () => {
    await drag('Meeting notes', on('Development', 'bottom'));
    await drag('Design', on('Research notes', 'top'));
    // [Project overview, Design, Research notes, Development, Meeting notes]

    await drag('Loose', on('Design', 'bottom')); // a note from Other, dropped between the folder Design and the note Research
    expect(application.vault.getPage(ids.Loose!)!.parentId).toBe(ids.Projects);
    expect(children()).toEqual(['Project overview', 'Design', 'Loose', 'Research notes', 'Development', 'Meeting notes']);
    expect(await storedOrder()).toEqual([n('Project overview'), f('Design'), n('Loose'), n('Research notes'), f('Development'), n('Meeting notes')]);

    await drag('Other', on('Research notes', 'top')); // a whole folder, from the root, between two notes
    expect(parentOf('Other')).toBe(ids.Projects);
    expect(children()).toEqual(['Project overview', 'Design', 'Loose', 'Other', 'Research notes', 'Development', 'Meeting notes']);
  });

  it('a note still cannot be placed in the root list, and a folder still cannot go into itself', async () => {
    await drag('Meeting notes', on('Other', 'top'), { release: false }); // a root position
    expect(feedback().filter((el) => el.dataset.dropFeedback === 'insert')).toHaveLength(0);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: on('Other', 'top') }));
    await settle();
    expect(application.vault.getPage(ids['Meeting notes']!)!.parentId).toBe(ids.Projects);

    await drag('Projects', on('Design', 'middle'), { release: false });
    expect(feedback()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Switching sort modes, positions outside Manual, and moves between parents.
// ---------------------------------------------------------------------------------------------------------

/** Picks `label` from a folder row's own "Sort by" menu — the real UI path into Sidebar's sort handler. */
function chooseSort(folderName: string, label: string) {
  const trigger = () => rowFor(folderName).querySelector('button[aria-haspopup="menu"]')!;
  fireEvent.click(trigger());
  if (!screen.queryByText('Sort by')) {
    fireEvent.click(trigger()); // (a menu left open by the previous pick toggles shut on the first click)
  }
  fireEvent.click(screen.getByText('Sort by'));
  fireEvent.click(screen.getByText(label));
}
const sortEntry = (folderName: string) => application.collectionViewConfigStore.get(`folder:${ids[folderName]!}`);
const n = (title: string) => `n:${ids[title]}`;
const f = (name: string) => `f:${ids[name]}`;
const noteTitles = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.entry[data-drag-kind="note"]')).map((row) => row.textContent?.trim() ?? '');

describe('switching between Manual and the other sorts', () => {
  beforeEach(async () => {
    await build([['Projects', null]], [['Zed', 'Projects'], ['Alpha', 'Projects']], false);
  });

  it('the first time Manual is chosen it starts from what is drawn, so nothing moves', () => {
    expect(noteTitles()).toEqual(['Alpha', 'Zed']);
    chooseSort('Projects', 'Manual');

    expect(noteTitles()).toEqual(['Alpha', 'Zed']);
    expect(sortEntry('Projects')).toEqual({ sidebarSort: { key: 'manual', direction: 'down' }, sidebarOrder: [n('Alpha'), n('Zed')] });
  });

  it('Manual → another sort → Manual brings back the saved arrangement and never reseeds it', async () => {
    chooseSort('Projects', 'Manual');
    await drag('Zed', on('Alpha', 'top')); // Zed before Alpha
    expect(noteTitles()).toEqual(['Zed', 'Alpha']);

    chooseSort('Projects', 'Name');
    expect(noteTitles()).toEqual(['Alpha', 'Zed']); // drawn by name…
    expect(sortEntry('Projects')?.sidebarOrder).toEqual([n('Zed'), n('Alpha')]); // …with the saved order untouched

    chooseSort('Projects', 'Manual');
    expect(noteTitles()).toEqual(['Zed', 'Alpha']); // restored, not re-seeded from the name order
    expect(sortEntry('Projects')?.sidebarOrder).toEqual([n('Zed'), n('Alpha')]);
  });

  it('a Name-sorted level takes a position: it becomes Manual, with the new order shown at once and saved', async () => {
    expect(noteTitles()).toEqual(['Alpha', 'Zed']);
    expect(sortEntry('Projects')).toBeUndefined();

    await drag('Zed', on('Alpha', 'top'), { release: false });
    expect(feedback()[0]).toHaveAttribute('data-drop-feedback', 'insert'); // the line is offered without choosing Manual
    expect(sortEntry('Projects')).toBeUndefined(); // …and merely dragging changed nothing
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: on('Alpha', 'top') }));
    await settle();

    expect(noteTitles()).toEqual(['Zed', 'Alpha']);
    expect(sortEntry('Projects')).toEqual({ sidebarSort: { key: 'manual', direction: 'down' }, sidebarOrder: [n('Zed'), n('Alpha')] });
    expect(tickedSort('Projects')).toEqual(['Manual']);
  });
});

describe('moves between parents and the saved orders', () => {
  // Source (Manual): S2 · Sub · S1.   Dest (sorted by name, with a saved manual order of its own): D1.
  beforeEach(async () => {
    await build(
      [
        ['Source', null],
        ['Sub', 'Source'],
        ['Dest', null],
      ],
      [
        ['S1', 'Source'],
        ['S2', 'Source'],
        ['D1', 'Dest'],
      ],
      false,
      () => {
        const store = application.collectionViewConfigStore;
        store.update(`folder:${ids.Source}`, { sidebarSort: { key: 'manual', direction: 'down' }, sidebarOrder: [n('S2'), f('Sub'), n('S1')] });
        store.update(`folder:${ids.Dest}`, { sidebarSort: { key: 'name', direction: 'down' }, sidebarOrder: [n('D1')] });
      }
    );
  });

  it('moving a note out removes it from the old parent\'s order, in order, and leaves a non-manual destination alone', async () => {
    const destinationBefore = sortEntry('Dest');
    await drag('S2', on('Dest', 'middle'));

    expect(application.vault.getPage(ids.S2!)!.parentId).toBe(ids.Dest);
    expect(sortEntry('Source')?.sidebarOrder).toEqual([f('Sub'), n('S1')]);
    expect(sortEntry('Dest')).toEqual(destinationBefore);
  });

  it('moving a folder out removes it from the old parent\'s order', async () => {
    await drag('Sub', on('Dest', 'middle'));

    expect(parentOf('Sub')).toBe(ids.Dest);
    expect(sortEntry('Source')?.sidebarOrder).toEqual([n('S2'), n('S1')]);
    expect(sortEntry('Dest')?.sidebarOrder).toEqual([n('D1')]);
  });

  it('a move that fails changes neither parent\'s order', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(application.pageOperations, 'move').mockRejectedValue(new Error('Cannot move'));
    const before = [sortEntry('Source'), sortEntry('Dest')];

    await drag('S2', on('Dest', 'middle'));

    expect(application.vault.getPage(ids.S2!)!.parentId).toBe(ids.Source);
    expect([sortEntry('Source'), sortEntry('Dest')]).toEqual(before);
  });

  it('a note coming back later goes to the end, not to the position it once held', async () => {
    await drag('S2', on('Dest', 'middle'));
    await drag('S2', on('Source', 'middle')); // back into Source
    expect(application.vault.getPage(ids.S2!)!.parentId).toBe(ids.Source);
    expect(noteTitles().filter((title) => title.includes('S'))).toEqual(['S1', 'S2'].filter((title) => noteTitles().some((t) => t.includes(title))));
    expect(sortEntry('Source')?.sidebarOrder).toEqual([f('Sub'), n('S1')]); // S2 is unlisted again, so it follows them
  });

  it('a position inside a non-manual destination switches THAT level to Manual; the source keeps its own sort', async () => {
    await drag('S1', on('D1', 'top'));

    expect(application.vault.getPage(ids.S1!)!.parentId).toBe(ids.Dest);
    expect(sortEntry('Dest')).toEqual({ sidebarSort: { key: 'manual', direction: 'down' }, sidebarOrder: [n('S1'), n('D1')] });
    expect(sortEntry('Source')?.sidebarSort).toEqual({ key: 'manual', direction: 'down' }); // unchanged
    expect(sortEntry('Source')?.sidebarOrder).toEqual([n('S2'), f('Sub')]); // S1 left it
  });

  it('dropping INTO that destination without a position leaves its sort mode alone', async () => {
    await drag('S1', on('Dest', 'middle'));
    expect(application.vault.getPage(ids.S1!)!.parentId).toBe(ids.Dest);
    expect(sortEntry('Dest')?.sidebarSort).toEqual({ key: 'name', direction: 'down' });
  });
});

// ---------------------------------------------------------------------------------------------------------
// The sort options: Name, Created time, Last edited, Manual — notes and folders as one sequence.
// ---------------------------------------------------------------------------------------------------------

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const kids = (parent: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.entry[data-drag-id]'))
    .filter((row) => row.dataset.dragParent === ids[parent])
    .map((row) => row.querySelector('.folder__title')?.textContent?.trim() ?? row.textContent?.trim() ?? '');
const rootRows = () => titleRows();

/** The Folders section's own menu — the vault root's Sort by. */
function chooseRootSort(label: string) {
  const trigger = () => screen.getByRole('button', { name: 'Folders actions' });
  fireEvent.click(trigger());
  if (!screen.queryByRole('menu')) {
    fireEvent.click(trigger()); // (a menu left open by the previous pick toggles shut on the first click)
  }
  fireEvent.click(within(screen.getByRole('menu')).getByText(label));
}

/** A restart: a new Application over the same files, with the store loaded from disk. */
async function restart() {
  cleanup();
  const loaded = await CollectionViewConfigStore.load(fileSystem, ROOT);
  const vault = application.vault;
  application = new Application(vault, fileSystem, new SelfWriteRegistry(), undefined, undefined, loaded);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  render(<AppLayout application={application} />);
  fireEvent.click(screen.getByTestId('sidebar.tab.notes'));
}

describe('the sort options on a level of real notes and folders', () => {
  // Created in this order, 5ms apart: Zed, Alpha, Mango (notes); the folder Beta (no dates of its own).
  beforeEach(async () => {
    await build([['Projects', null]], [], false);
    for (const title of ['Zed', 'Alpha', 'Mango']) {
      ids[title] = await application.pageOperations.create({ folderId: ids.Projects!, title });
      await tick();
    }
    ids.Beta = await application.folderOperations.create('Beta', ids.Projects!);
    cleanup();
    render(<AppLayout application={application} />);
    fireEvent.click(screen.getByTestId('sidebar.tab.notes'));
  });

  it('Name: notes and folders alphabetically together — the folder sits between the notes', () => {
    expect(kids('Projects')).toEqual(['Alpha', 'Beta', 'Mango', 'Zed']);
  });

  it('Created time: oldest first; folders carry no date, so they come after the dated notes', () => {
    chooseSort('Projects', 'Created time');
    expect(kids('Projects')).toEqual(['Zed', 'Alpha', 'Mango', 'Beta']);
    expect(sortEntry('Projects')?.sidebarSort).toEqual({ key: 'created', direction: 'up' });
  });

  it('Last edited: most recently edited first (folders, with no date, after the notes)', () => {
    chooseSort('Projects', 'Last edited');
    expect(kids('Projects')).toEqual(['Mango', 'Alpha', 'Zed', 'Beta']);
    expect(sortEntry('Projects')?.sidebarSort).toEqual({ key: 'updated', direction: 'down' });
  });

  it('a note moves when its modification timestamp changes', async () => {
    chooseSort('Projects', 'Last edited');
    const zed = application.vault.getPage(ids.Zed!)!;
    await tick();
    act(() => {
      application.vault.replacePage({ ...zed, metadata: { ...zed.metadata, updatedAt: new Date().toISOString() } });
    });
    await settle();
    expect(kids('Projects')[0]).toBe('Zed');
  });

  it('CHARACTERIZATION — today no edit changes a note\'s modification timestamp, so Last edited follows creation order for notes edited in the app', async () => {
    // `updatedAt` is the frontmatter `modified`, which saves carry over unchanged (and `PageRebuilder` only
    // stamps it when the file has none): body saves and metadata edits leave it alone; archive and restore
    // set it. If that ever changes, this test says so and the sort will start tracking edits.
    chooseSort('Projects', 'Last edited');
    const before = application.vault.getPage(ids.Zed!)!.metadata.updatedAt;
    await tick();
    await application.pageOperations.open(ids.Zed!);
    await application.pageOperations.save(ids.Zed!, 'An edit of the body.');
    await application.pageOperations.updateMetadata(ids.Zed!, { icon: '📝' });
    await settle();

    expect(application.vault.getPage(ids.Zed!)!.metadata.updatedAt).toBe(before);
    expect(kids('Projects')).toEqual(['Mango', 'Alpha', '📝Zed', 'Beta']);
  });

  it('a new item appears where each sort puts it', async () => {
    chooseSort('Projects', 'Created time');
    await tick();
    ids.Fresh = await application.pageOperations.create({ folderId: ids.Projects!, title: 'Fresh' });
    await settle();
    expect(kids('Projects')).toEqual(['Zed', 'Alpha', 'Mango', 'Fresh', 'Beta']); // newest dated note, before the undated folder

    chooseSort('Projects', 'Last edited');
    expect(kids('Projects')[0]).toBe('Fresh');

    chooseSort('Projects', 'Name');
    expect(kids('Projects')).toEqual(['Alpha', 'Beta', 'Fresh', 'Mango', 'Zed']);

    chooseSort('Projects', 'Manual'); // first time: seeds from the Name order just drawn
    expect(kids('Projects')).toEqual(['Alpha', 'Beta', 'Fresh', 'Mango', 'Zed']);
    await tick();
    ids.Later = await application.pageOperations.create({ folderId: ids.Projects!, title: 'Aardvark' });
    await settle();
    expect(kids('Projects').at(-1)).toBe('Aardvark'); // not in the saved order: after the listed items
  });

  it('switching to Created time or Last edited never touches the saved manual order', async () => {
    chooseSort('Projects', 'Manual');
    await drag('Zed', on('Alpha', 'top'));
    const saved = sortEntry('Projects')?.sidebarOrder;
    expect(saved).toEqual([n('Zed'), n('Alpha'), f('Beta'), n('Mango')]);

    chooseSort('Projects', 'Created time');
    expect(sortEntry('Projects')?.sidebarOrder).toEqual(saved);
    chooseSort('Projects', 'Last edited');
    expect(sortEntry('Projects')?.sidebarOrder).toEqual(saved);
    chooseSort('Projects', 'Name');
    expect(sortEntry('Projects')?.sidebarOrder).toEqual(saved);

    chooseSort('Projects', 'Manual');
    expect(kids('Projects')).toEqual(['Zed', 'Alpha', 'Beta', 'Mango']);
    expect(sortEntry('Projects')?.sidebarOrder).toEqual(saved);
  });

  it('the chosen mode is saved and comes back after a restart', async () => {
    chooseSort('Projects', 'Created time');
    await settle(); // (the store writes in the background)
    await restart();
    expect(kids('Projects')).toEqual(['Zed', 'Alpha', 'Mango', 'Beta']);
    expect(sortEntry('Projects')?.sidebarSort).toEqual({ key: 'created', direction: 'up' });
  });

  it.each(['Name', 'Created time', 'Last edited'])('in %s, a position is offered and its drop switches the level to Manual', async (label) => {
    chooseSort('Projects', label);
    const [first, second] = kids('Projects') as [string, string];
    expect(tickedSort('Projects')).not.toEqual(['Manual']);

    await drag(second, on(first, 'top'), { release: false });
    expect(feedback()[0]).toHaveAttribute('data-drop-feedback', 'insert');
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: on(first, 'top') }));
    await settle();

    expect(kids('Projects')[0]).toBe(second); // shown at once
    expect(sortEntry('Projects')?.sidebarSort).toEqual({ key: 'manual', direction: 'down' });
    expect(tickedSort('Projects')).toEqual(['Manual']);
  });

  it('already Manual, a reorder keeps working and keeps Manual', async () => {
    chooseSort('Projects', 'Manual');
    await drag(kids('Projects')[1]!, on(kids('Projects')[0]!, 'top'), { release: false });
    expect(feedback()[0]).toHaveAttribute('data-drop-feedback', 'insert');
  });
});

describe('sort modes are independent per level, root included', () => {
  beforeEach(async () => {
    await build([['Gamma', null], ['Alpha', null], ['Beta', null]], [], false);
  });

  it('two parents can be sorted differently at once', async () => {
    cleanup();
    await build([['P1', null], ['P2', null]], [], false);
    for (const [title, folder] of [['P1 Zed', 'P1'], ['P1 Alpha', 'P1'], ['P2 Zed', 'P2'], ['P2 Alpha', 'P2']] as const) {
      ids[title] = await application.pageOperations.create({ folderId: ids[folder]!, title });
      await tick(); // (created times are told apart by the millisecond)
    }
    cleanup();
    render(<AppLayout application={application} />);
    fireEvent.click(screen.getByTestId('sidebar.tab.notes'));
    chooseSort('P1', 'Created time');
    expect(kids('P1')).toEqual(['P1 Zed', 'P1 Alpha']); // created oldest first
    expect(kids('P2')).toEqual(['P2 Alpha', 'P2 Zed']); // still by name
  });

  it('the root has the same menu: Name, Manual (seeded from the drawn order), and back to the saved order', async () => {
    expect(rootRows()).toEqual(['Alpha', 'Beta', 'Gamma']);

    chooseRootSort('Manual'); // first time: seeds from the drawn order
    expect(application.collectionViewConfigStore.get('sidebar:root')).toEqual({
      sidebarSort: { key: 'manual', direction: 'down' },
      sidebarOrder: [f('Alpha'), f('Beta'), f('Gamma')],
    });

    await drag('Gamma', on('Alpha', 'top'));
    expect(rootRows()).toEqual(['Gamma', 'Alpha', 'Beta']);

    chooseRootSort('Name');
    expect(rootRows()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(application.collectionViewConfigStore.get('sidebar:root')?.sidebarOrder).toEqual([f('Gamma'), f('Alpha'), f('Beta')]);

    chooseRootSort('Manual');
    expect(rootRows()).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('root folders can be reordered from any sort mode: the drop switches the root to Manual and saves the order', async () => {
    expect(rootRows()).toEqual(['Alpha', 'Beta', 'Gamma']); // the default: Name
    await drag('Gamma', on('Alpha', 'top'));

    expect(rootRows()).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(application.collectionViewConfigStore.get('sidebar:root')).toEqual({
      sidebarSort: { key: 'manual', direction: 'down' },
      sidebarOrder: [f('Gamma'), f('Alpha'), f('Beta')],
    });

    chooseRootSort('Name'); // back to a sort: the saved arrangement is kept…
    expect(rootRows()).toEqual(['Alpha', 'Beta', 'Gamma']);
    await drag('Beta', on('Alpha', 'top')); // …and a position works from here too
    expect(application.collectionViewConfigStore.get('sidebar:root')?.sidebarSort).toEqual({ key: 'manual', direction: 'down' });
    expect(rootRows()[0]).toBe('Beta');
  });
});

// ---------------------------------------------------------------------------------------------------------
// The selected mode is the user's: Name by default, kept, persisted, and never inferred from a drag.
// ---------------------------------------------------------------------------------------------------------

/** Which choice a folder row's own Sort by menu ticks right now (the active one has an icon in its leading slot). */
function tickedSort(folderName: string): string[] {
  const trigger = () => rowFor(folderName).querySelector('button[aria-haspopup="menu"]')!;
  fireEvent.click(trigger());
  if (!screen.queryByText('Sort by')) {
    fireEvent.click(trigger());
  }
  fireEvent.click(screen.getByText('Sort by'));
  const ticked = within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .filter((item) => item.querySelector('.entry__leading svg') !== null)
    .map((item) => item.textContent?.trim() ?? '');
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  return ticked;
}

describe('the selected sort mode: default, persistence, and drag never changes it', () => {
  beforeEach(async () => {
    await build([['Projects', null]], [['Zed', 'Projects'], ['Alpha', 'Projects']], false);
  });

  it('Name is the default for a level with nothing saved: ticked, drawn A→Z, nothing stored', () => {
    expect(sortEntry('Projects')).toBeUndefined();
    expect(tickedSort('Projects')).toEqual(['Name']);
    expect(noteTitles()).toEqual(['Alpha', 'Zed']);
  });

  it('Manual stays selected after reordering by drag — it is never switched back to Name', async () => {
    chooseSort('Projects', 'Manual');
    expect(tickedSort('Projects')).toEqual(['Manual']);

    await drag('Zed', on('Alpha', 'top'));
    expect(noteTitles()).toEqual(['Zed', 'Alpha']);
    expect(sortEntry('Projects')?.sidebarSort).toEqual({ key: 'manual', direction: 'down' });
    expect(tickedSort('Projects')).toEqual(['Manual']);

    await drag('Alpha', on('Zed', 'top')); // and again
    expect(tickedSort('Projects')).toEqual(['Manual']);
  });

  it('only a successful positional drop changes the mode: starting, hovering and cancelling a drag do not', async () => {
    await drag('Zed', on('Alpha', 'top'), { release: false });
    expect(sortEntry('Projects')).toBeUndefined();
    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 60, clientY: on('Alpha', 'top') }));
    await settle();

    expect(sortEntry('Projects')).toBeUndefined();
    expect(tickedSort('Projects')).toEqual(['Name']);
    expect(noteTitles()).toEqual(['Alpha', 'Zed']);
  });

  it('a Name level reordered by drag reopens as Manual, in the new order', async () => {
    await drag('Zed', on('Alpha', 'top'));
    await settle();
    await restart();

    expect(noteTitles()).toEqual(['Zed', 'Alpha']);
    expect(tickedSort('Projects')).toEqual(['Manual']);
  });

  it('the mode and the manual order both survive a restart', async () => {
    chooseSort('Projects', 'Manual');
    await drag('Zed', on('Alpha', 'top'));
    await settle();
    await restart();

    expect(noteTitles()).toEqual(['Zed', 'Alpha']);
    expect(tickedSort('Projects')).toEqual(['Manual']);
    expect(sortEntry('Projects')).toEqual({ sidebarSort: { key: 'manual', direction: 'down' }, sidebarOrder: [n('Zed'), n('Alpha')] });
  });

  it('Manual → Name → restart → Manual: Name is remembered, and Manual brings back the saved order without reseeding', async () => {
    chooseSort('Projects', 'Manual');
    await drag('Zed', on('Alpha', 'top'));
    chooseSort('Projects', 'Name');
    await settle();
    await restart();

    expect(tickedSort('Projects')).toEqual(['Name']);
    expect(noteTitles()).toEqual(['Alpha', 'Zed']);
    expect(sortEntry('Projects')?.sidebarOrder).toEqual([n('Zed'), n('Alpha')]);

    chooseSort('Projects', 'Manual');
    expect(noteTitles()).toEqual(['Zed', 'Alpha']);
    expect(sortEntry('Projects')?.sidebarOrder).toEqual([n('Zed'), n('Alpha')]);
  });
});
