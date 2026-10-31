// @vitest-environment jsdom

// Manual sibling order (ADR-055): reordering by drag, persisted in the real CollectionViewConfigStore.
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRAG_REVEAL_DELAY_MS, FolderTree, type SidebarRowActions } from './FolderTree';
import { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import { collectionViewKeyForFolder, collectionViewKeyForSidebarRoot } from '@core/application/collection/collectionViewKey';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { PageOperations } from '@core/application/page/PageOperations';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '@core/workspace/Workspace';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { MoveService } from '@core/vault/persistence/MoveService';
import { PagePathResolver } from '@core/application/page/PagePathResolver';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { VaultResource } from '@core/vault/models/VaultResource';


const ROOT = '/vault';

/** What the sidebar row measures as in a real layout (jsdom measures everything as 0). */
const ROW_RECT = { left: 12, top: 100, width: 236, height: 28 };

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: {
      defaultTemplateId: null,
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      coverHidden: false,
      coverLayout: 'side' as const,
      coverPositionAbove: 50,
      coverPositionSide: 50,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function makePage(id: string, path: string, parentId: string | null): Page {
  return new PageBuilder().build({
    parentId,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function setup(folders: Folder[], pages: Page[] = [], resources: VaultResource[] = []) {
  const vault = new Vault(ROOT, pages, folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), resources);
  const query = new VaultQuery(vault);
  const fileSystem = new InMemoryVaultFileSystem();
  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    documentRegistry,
    saveCoordinator,
    () => {}
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );
  const membershipSelector = new MembershipSelector(
    vault,
    query,
    new EffectivePageState(vault, query, pageOperations, workspace)
  );

  return {
    vault,
    query,
    workspace,
    membershipSelector,
    coordinator,
    fileSystem,
    pageOperations,
    folderOperations,
    enqueueSpy: vi.spyOn(coordinator, 'enqueue'),
    moveSpy: vi.spyOn(folderOperations, 'move'),
    renameSpy: vi.spyOn(folderOperations, 'rename'),
  };
}


const key = (parentId: string | null) => (parentId === null ? collectionViewKeyForSidebarRoot() : collectionViewKeyForFolder(parentId));

const MANUAL = { key: 'manual', direction: 'down' } as const;
/** Orders these folders' children by hand (positions are only offered in a Manual level). */
const makeManual = (store: CollectionViewConfigStore, ...folderIds: string[]) => {
  folderIds.forEach((id) => store.update(`folder:${id}`, { sidebarSort: MANUAL }));
  store.update('sidebar:root', { sidebarSort: MANUAL }); // (the root too: a position is only offered in a Manual list)
};

/** The tree wired to a real store exactly as Sidebar.tsx wires it, re-rendering after every write. */
function renderOrdered(
  env: ReturnType<typeof setup>,
  store: CollectionViewConfigStore,
  extra: Partial<React.ComponentProps<typeof FolderTree>> = {}
) {
  const tree = () => (
    <FolderTree
      query={env.query}
      membershipSelector={env.membershipSelector}
      workspace={env.workspace}
      parentId={null}
      level={0}
      onPageClick={vi.fn()}
      onDraftPageClick={vi.fn()}
      onFolderClick={vi.fn()}
      onCreateNote={vi.fn()}
      pendingNewFolder={null}
      onCommitNewFolder={vi.fn()}
      onCancelNewFolder={vi.fn()}
      rowActions={actionsFor(env)}
      enableDrag
      getFolderSort={(parentId) => store.get(key(parentId))?.sidebarSort}
      getLevelOrder={(parentId) => store.get(key(parentId))?.sidebarOrder}
      onLevelOrderChange={(parentId, order) => {
        store.update(key(parentId), { sidebarSort: { key: 'manual', direction: 'down' }, sidebarOrder: order });
        utils.rerender(tree());
      }}
      {...extra}
    />
  );
  const utils = render(tree());
  return utils;
}

function actionsFor(e: ReturnType<typeof setup>): SidebarRowActions {
  return new Proxy(
    {
      editingId: null,
      openMenuId: null,
      noteMoveDestinations: [],
      resourceMoveDestinations: [],
      createFolderInZone: () => undefined,
      onMoveNote: (pageId: string, destinationId: string | null) => e.pageOperations.move(pageId, destinationId),
      onMoveFolder: (folderId: string, destinationId: string | null) => e.folderOperations.move(folderId, destinationId),
      canMoveNoteInto: (pageId: string, destinationId: string | null) => e.pageOperations.canMove(pageId, destinationId),
      canMoveFolderInto: (folderId: string, destinationId: string | null) => e.folderOperations.canMove(folderId, destinationId),
    },
    { get: (target, k) => (k in target ? (target as Record<PropertyKey, unknown>)[k] : vi.fn()) }
  ) as unknown as SidebarRowActions;
}

const rowTitles = () =>
  Array.from(document.body.querySelectorAll<HTMLElement>('.entry'))
    .filter((row) => !row.closest('.drag-ghost'))
    .map((row) => row.querySelector('.folder__title, .note__title, [class*="title"]')?.textContent ?? row.textContent ?? '');

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const feedbackNow = () => Array.from(document.body.querySelectorAll<HTMLElement>('[data-drop-feedback]'));

let env: ReturnType<typeof setup>;
let fileSystem: InMemoryVaultFileSystem;
let store: CollectionViewConfigStore;

beforeEach(async () => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (!this.classList.contains('entry')) {
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect;
    }
    const rows = Array.from(document.querySelectorAll('.entry')).filter((row) => !row.closest('.drag-ghost'));
    // A scrolled container (see the auto-scroll tests) shifts every row up by its scrollTop.
    const scrolled = (this.closest('[data-test-scroller]') as HTMLElement | null)?.scrollTop ?? 0;
    const top = ROW_RECT.top + Math.max(0, rows.indexOf(this)) * ROW_RECT.height - scrolled;
    return { left: ROW_RECT.left, top, width: ROW_RECT.width, height: ROW_RECT.height, right: ROW_RECT.left + ROW_RECT.width, bottom: top + ROW_RECT.height, x: ROW_RECT.left, y: top } as DOMRect;
  });

  // Alpha: Note A, Note B, Note C, then folders Sub, Sub2.  Beta: Note X.  Gamma.  Root folders: Alpha, Beta, Gamma.
  env = setup(
    [
      makeFolder('a', `${ROOT}/Alpha`, null),
      makeFolder('s', `${ROOT}/Alpha/Sub`, 'a'),
      makeFolder('s2', `${ROOT}/Alpha/Sub2`, 'a'),
      makeFolder('b', `${ROOT}/Beta`, null),
      makeFolder('g', `${ROOT}/Gamma`, null),
    ],
    [
      makePage('na', `${ROOT}/Alpha/Note A.md`, 'a'),
      makePage('nb', `${ROOT}/Alpha/Note B.md`, 'a'),
      makePage('nc', `${ROOT}/Alpha/Note C.md`, 'a'),
      makePage('nx', `${ROOT}/Beta/Note X.md`, 'b'),
    ]
  );
  fileSystem = env.fileSystem;
  for (const folder of env.vault.folders()) {
    await fileSystem.createDirectory(folder.path);
  }
  for (const page of env.vault.pages()) {
    fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  }
  store = await CollectionViewConfigStore.load(fileSystem, ROOT);
  makeManual(store, 'a', 'b');
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
  document.body.removeAttribute('style');
});

const rowFor = (title: string) => {
  const rows = screen.getAllByText(title).map((el) => el.closest('.entry') as HTMLElement).filter((row) => !row.closest('.drag-ghost'));
  expect(rows).toHaveLength(1);
  return rows[0]!;
};
const press = (target: Element, x = 40, y = 114) =>
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true, clientX: x, clientY: y });
const move = (x: number, y: number) => act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y }));
const release = (x: number, y: number) => act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: x, clientY: y }));

/** Drag `title`'s row to viewport y and release there. Rows (28px, from 100) are named in each test. */
async function dragTo(title: string, y: number) {
  press(rowFor(title), 40, rowFor(title).getBoundingClientRect().top + 14);
  move(60, y);
  release(60, y);
  await settle();
}

describe('Alpha, expanded, from y=100: Alpha, Note A, Note B, Note C, Sub, Sub2, Beta, Note X, Gamma', () => {
  it('starts in name order, with nothing stored', () => {
    renderOrdered(env, store);
    expect(rowTitles().slice(0, 7)).toEqual(['Alpha', 'Note A', 'Note B', 'Note C', 'Sub', 'Sub2', 'Beta']);
    expect(store.get('folder:a')?.sidebarOrder).toBeUndefined();
  });

  it('reorders notes among their siblings without moving anything, and the level silently becomes Manual', async () => {
    const pageMove = vi.spyOn(env.pageOperations, 'move');
    renderOrdered(env, store);

    // Note C → before Note A (Note A: 128–156, top edge).
    await dragTo('Note C', 130);

    expect(rowTitles().slice(0, 7)).toEqual(['Alpha', 'Note C', 'Note A', 'Note B', 'Sub', 'Sub2', 'Beta']);
    expect(store.get('folder:a')).toEqual({
      sidebarSort: { key: 'manual', direction: 'down' },
      sidebarOrder: ['n:nc', 'n:na', 'n:nb', 'f:s', 'f:s2'], // seeded from what was drawn, then the move applied
    });
    expect(pageMove).not.toHaveBeenCalled();
    expect(env.vault.getPage('nc')!.path).toBe(`${ROOT}/Alpha/Note C.md`); // same file, same place
    expect(feedbackNow()).toHaveLength(0);
  });

  it('a level sorted another way still takes a position: the drop switches it to Manual, seeded from what it drew', async () => {
    store.update('folder:a', { sidebarSort: { key: 'name', direction: 'up' }, sidebarOrder: ['n:nb', 'n:na', 'n:nc'] });
    renderOrdered(env, store);
    // Drawn Z→A across notes AND folders — not by the old saved order.
    expect(rowTitles().slice(1, 6)).toEqual(['Sub2', 'Sub', 'Note C', 'Note B', 'Note A']);

    press(rowFor('Note A'), 40, 254);
    move(60, 186); // Note C's top edge: a position, in a level that is not Manual
    expect(feedbackNow()[0]).toHaveAttribute('data-drop-feedback', 'insert');
    release(60, 186);
    await settle();

    // One write: the mode and the order together. The new order is what was drawn, with Note A placed.
    expect(store.get('folder:a')).toEqual({
      sidebarSort: { key: 'manual', direction: 'down' },
      sidebarOrder: ['f:s2', 'f:s', 'n:na', 'n:nc', 'n:nb'],
    });
    // …and the tree shows it at once, never the Z→A order in between.
    expect(rowTitles().slice(1, 6)).toEqual(['Sub2', 'Sub', 'Note A', 'Note C', 'Note B']);
  });

  it.each([
    ['Created time', { key: 'created', direction: 'up' }],
    ['Last edited', { key: 'updated', direction: 'down' }],
  ] as const)('%s levels take a position too, and become Manual', async (_label, sort) => {
    store.update('folder:a', { sidebarSort: sort });
    renderOrdered(env, store);
    const before = rowTitles().slice(1, 4); // undated notes: name order

    await dragTo('Note C', 130); // before Note A
    expect(store.get('folder:a')?.sidebarSort).toEqual({ key: 'manual', direction: 'down' });
    expect(rowTitles().slice(1, 4)).toEqual([before[2], before[0], before[1]]);
  });

  it('a cross-parent position switches only the DESTINATION to Manual — the source keeps its own sort', async () => {
    store.update('folder:a', { sidebarSort: { key: 'updated', direction: 'down' } }); // source: not Manual
    store.update('folder:b', { sidebarSort: { key: 'name', direction: 'down' } }); // destination: not Manual
    renderOrdered(env, store);

    // Note A → before Note X (Beta's only note). Rows: Alpha, then its five children, Beta, Note X.
    await dragTo('Note A', 100 + 7 * 28 + 2);

    expect(env.vault.getPage('na')!.parentId).toBe('b');
    expect(store.get('folder:b')).toEqual({ sidebarSort: { key: 'manual', direction: 'down' }, sidebarOrder: ['n:na', 'n:nx'] });
    expect(store.get('folder:a')?.sidebarSort).toEqual({ key: 'updated', direction: 'down' }); // unchanged
    expect(store.get(collectionViewKeyForSidebarRoot())?.sidebarSort?.key).toBe('manual'); // (the fixture's own root preset)
  });

  it('dropping INTO a folder (no position) does not switch the destination to Manual', async () => {
    store.update('folder:b', { sidebarSort: { key: 'name', direction: 'down' } });
    renderOrdered(env, store);

    // Note A → the middle of Beta's row (a destination, not a position).
    await dragTo('Note A', rowFor('Beta').getBoundingClientRect().top + 14);

    expect(env.vault.getPage('na')!.parentId).toBe('b');
    expect(store.get('folder:b')).toEqual({ sidebarSort: { key: 'name', direction: 'down' } });
  });

  it('a cancelled drag, and a drop on no valid position, change no sort mode and no order', async () => {
    store.update('folder:a', { sidebarSort: { key: 'name', direction: 'up' }, sidebarOrder: ['n:nb'] });
    renderOrdered(env, store);
    const before = JSON.stringify([store.get('folder:a'), store.get('folder:b'), store.get('sidebar:root')]);

    press(rowFor('Note A'), 40, 254);
    move(60, 186);
    expect(feedbackNow()).toHaveLength(1);
    act(() => void fireEvent.keyDown(document, { key: 'Escape' })); // cancelled
    release(60, 186);
    await settle();
    expect(JSON.stringify([store.get('folder:a'), store.get('folder:b'), store.get('sidebar:root')])).toBe(before);

    press(rowFor('Note A'), 40, 254);
    move(500, 186); // off the list: no target
    release(500, 186);
    await settle();
    expect(JSON.stringify([store.get('folder:a'), store.get('folder:b'), store.get('sidebar:root')])).toBe(before);
  });

  it('keeps each parent independent', async () => {
    renderOrdered(env, store);
    await dragTo('Note C', 130);
    expect(store.get('folder:a')?.sidebarSort?.key).toBe('manual');
    expect(store.get('folder:b')?.sidebarOrder).toBeUndefined();
    expect(store.get(collectionViewKeyForSidebarRoot())?.sidebarOrder).toBeUndefined();
  });

  it('reorders folders among sibling folders, and the order survives a restart', async () => {
    renderOrdered(env, store);
    await dragTo('Sub2', 1000 - 1000 + rowFor('Sub').getBoundingClientRect().top + 2); // Sub2 → before Sub

    expect(rowTitles().slice(4, 6)).toEqual(['Sub2', 'Sub']);

    cleanup();
    const restarted = await CollectionViewConfigStore.load(fileSystem, ROOT);
    renderOrdered(env, restarted);
    expect(rowTitles().slice(0, 7)).toEqual(['Alpha', 'Note A', 'Note B', 'Note C', 'Sub2', 'Sub', 'Beta']);
    expect(restarted.get('folder:a')?.sidebarOrder).toEqual(['n:na', 'n:nb', 'n:nc', 'f:s2', 'f:s']);
  });

  it('a note can reach the end of the notes even though folders follow; a folder is never offered a spot beside a note', () => {
    renderOrdered(env, store);

    press(rowFor('Note A'), 40, 142);
    move(60, 210); // Note C's bottom edge: the last note, with the Sub folder right after it
    expect(feedbackNow().filter((f) => f.dataset.dropFeedback === 'insert')).toHaveLength(1);
    release(60, 210);
  });

  it('a folder can be placed beside a note — between notes, and at the edge between the groups', () => {
    renderOrdered(env, store);
    const line = () => feedbackNow().find((f) => f.dataset.dropFeedback === 'insert');

    press(rowFor('Sub'), 40, 226);
    move(60, 130); // Note A, top edge: before it
    expect(line()!.style.top).toBe('128px');
    move(60, 170); // Note B (156–184), the middle: after it
    expect(line()!.style.top).toBe('184px');
    move(60, 210); // Note C's bottom edge borders Sub itself: no move, so no line
    expect(line()).toBeUndefined();
    move(60, 266); // Sub2's bottom edge: the end of the list
    expect(line()).toBeDefined();
  });

  it('a note can be placed beside a folder, and still never in the root list', () => {
    renderOrdered(env, store);
    const lines = () => feedbackNow().filter((f) => f.dataset.dropFeedback === 'insert');

    press(rowFor('Note A'), 40, 142);
    move(60, 214); // Sub's top edge (inside Alpha): before the folder Sub
    expect(lines()).toHaveLength(1);
    expect(lines()[0]!.style.top).toBe('212px');
    for (const y of [102, 270, 326, 350]) {
      move(60, y); // top of Alpha, Beta, Gamma and the bottom of Gamma: all root positions
      expect(lines()).toHaveLength(0);
    }
  });
});

describe('root folders', () => {
  it('reorder among the root siblings, stored under the dedicated root key', async () => {
    renderOrdered(env, store);
    const gammaRow = () => rowFor('Gamma');
    // Gamma → before Alpha (top edge of the first row).
    press(gammaRow(), 40, gammaRow().getBoundingClientRect().top + 14);
    move(60, 102);
    release(60, 102);
    await settle();

    expect(rowTitles()[0]).toBe('Gamma');
    expect(store.get(collectionViewKeyForSidebarRoot())).toEqual({
      sidebarSort: { key: 'manual', direction: 'down' },
      sidebarOrder: ['f:g', 'f:a', 'f:b'],
    });
    // Neither the Workspace collection page nor any folder's entry was touched.
    expect(store.get('view:workspace')).toBeUndefined();
    expect(store.get('folder:a')?.sidebarOrder).toBeUndefined();
  });

});

describe('moving between parents, then ordering', () => {
  it('a folder dropped beside a folder in another parent is moved with FolderOperations.move, then placed there', async () => {
    const folderMove = vi.spyOn(env.folderOperations, 'move');
    renderOrdered(env, store);

    // Gamma → before Sub (Sub: 4th row after Alpha's three notes → top 100 + 4*28 = 212).
    await dragTo('Gamma', 214);

    expect(folderMove).toHaveBeenCalledExactlyOnceWith('g', 'a');
    expect(env.vault.getFolder('g')!.parentId).toBe('a');
    expect(rowTitles().slice(0, 8)).toEqual(['Alpha', 'Note A', 'Note B', 'Note C', 'Gamma', 'Sub', 'Sub2', 'Beta']);
    expect(store.get('folder:a')?.sidebarOrder).toEqual(['n:na', 'n:nb', 'n:nc', 'f:g', 'f:s', 'f:s2']);
  });

  it('a note dropped beside a note in another parent is moved with PageOperations.move, then placed there', async () => {
    const pageMove = vi.spyOn(env.pageOperations, 'move');
    renderOrdered(env, store);

    // Note A → before Note X (Beta's only note). Rows: Alpha, A, B, C, Sub, Sub2, Beta, X → X at 100 + 7*28 = 296.
    await dragTo('Note A', 298);

    expect(pageMove).toHaveBeenCalledExactlyOnceWith('na', 'b');
    expect(env.vault.getPage('na')!.parentId).toBe('b');
    expect(store.get('folder:b')).toEqual({
      sidebarSort: { key: 'manual', direction: 'down' },
      sidebarOrder: ['n:na', 'n:nx'],
    });
  });

  it('a move that fails writes no ordering', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(env.pageOperations, 'move').mockRejectedValue(new Error('Cannot move'));
    renderOrdered(env, store);

    await dragTo('Note A', 298);

    expect(env.vault.getPage('na')!.parentId).toBe('a');
    expect(store.get('folder:b')?.sidebarOrder).toBeUndefined();
    expect(store.get('folder:a')?.sidebarOrder).toBeUndefined();
  });

  it('a folder dropped on a root position is moved to the root, then placed there', async () => {
    renderOrdered(env, store);

    // Sub → before Beta (root). Beta's row is at 100 + 6*28 = 268.
    await dragTo('Sub', 270);

    expect(env.vault.getFolder('s')!.parentId).toBeNull();
    expect(store.get(collectionViewKeyForSidebarRoot())?.sidebarOrder).toEqual(['f:a', 'f:s', 'f:b', 'f:g']);
  });
});

// ---------------------------------------------------------------------------------------------------------
// After an expanded folder: the end of its whole rendered subtree is its "after" position.
// ---------------------------------------------------------------------------------------------------------

describe('after an expanded folder: the end of its subtree', () => {
  // All expanded, rows from y=100 (28px):
  //   Alpha 100 · Note A 128 · Inner 156 · Note I 184 · Deep 212 · Note D 240 · deep.png 268 · Beta 296 · Gamma 324
  // (a Manual level draws its notes and folders first, then its files.) Alpha's, Inner's and Deep's subtrees
  // all end at deep.png (268–296).
  const END_Y = 292; // deep.png's bottom edge
  const resource = (id: string, parentId: string): VaultResource => ({
    id,
    kind: 'image',
    name: id,
    path: `${ROOT}/${id}`,
    parentId,
  });
  // The tree indents a row by --space-6 + 24px per level; jsdom has no stylesheet, so the same formula stands in for it.
  const LEFT = { alpha: 12 + 6, inner: 12 + 6 + 24, deep: 12 + 6 + 48, noteInDeep: 12 + 6 + 72 };

  const insertLine = () => feedbackNow().find((f) => f.dataset.dropFeedback === 'insert');

  async function build(collapse: string[] = []) {
    cleanup();
    env = setup(
      [
        makeFolder('alpha', `${ROOT}/Alpha`, null),
        makeFolder('inner', `${ROOT}/Alpha/Inner`, 'alpha'),
        makeFolder('deep', `${ROOT}/Alpha/Inner/Deep`, 'inner'),
        makeFolder('b', `${ROOT}/Beta`, null),
        makeFolder('g', `${ROOT}/Gamma`, null),
      ],
      [
        makePage('na', `${ROOT}/Alpha/Note A.md`, 'alpha'),
        makePage('ni', `${ROOT}/Alpha/Inner/Note I.md`, 'inner'),
        makePage('nd', `${ROOT}/Alpha/Inner/Deep/Note D.md`, 'deep'),
      ],
      [resource('deep.png', 'deep')]
    );
    for (const folder of env.vault.folders()) {
      await env.fileSystem.createDirectory(folder.path);
    }
    for (const page of env.vault.pages()) {
      env.fileSystem.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
    }
    collapse.forEach((id) => env.workspace.toggleFolderExpanded(id));
    store = await CollectionViewConfigStore.load(env.fileSystem, ROOT);
    makeManual(store, ...Array.from(env.vault.folders(), (folder) => folder.id));
    // Hand-arranged the way these tests are drawn: each folder's notes, then its folders.
    store.update('folder:alpha', { sidebarOrder: ['n:na', 'f:inner'] });
    store.update('folder:inner', { sidebarOrder: ['n:ni', 'f:deep'] });
    store.update('folder:deep', { sidebarOrder: ['n:nd'] });
    renderOrdered(env, store);
  }

  beforeEach(() => {
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(
      (element: Element) =>
        ({ paddingLeft: `${6 + 24 * (Number((element as HTMLElement).style.getPropertyValue('--tree-level')) || 0)}px` }) as CSSStyleDeclaration
    );
  });

  it('the rows are laid out as these tests assume', async () => {
    await build();
    expect(rowTitles().slice(0, 9)).toEqual(['Alpha', 'Note A', 'Inner', 'Note I', 'Deep', 'Note D', 'deep', 'Beta', 'Gamma']);
  });

  it('the bottom edge of the last row of the subtree is "after" the enclosing folder, drawn after the whole subtree', async () => {
    await build();
    press(rowFor('Gamma'), 40, 338);
    move(20, END_Y); // left of every enclosing indent but Alpha's

    expect(insertLine()).toBeDefined();
    expect(insertLine()!.style.top).toBe('296px'); // the bottom of deep.png, the end of the subtree
    expect(insertLine()!.style.left).toBe(`${LEFT.alpha}px`); // at Alpha's own indent: a sibling of Alpha
    expect(feedbackNow().filter((f) => f.dataset.dropFeedback === 'inside')).toHaveLength(0);
  });

  it('it is a position beside Alpha, not inside it: releasing there reorders the root, and nothing is moved', async () => {
    await build();
    const folderMove = vi.spyOn(env.folderOperations, 'move');
    press(rowFor('Gamma'), 40, 338);
    move(20, END_Y);
    release(20, END_Y);
    await settle();

    expect(folderMove).not.toHaveBeenCalled();
    expect(env.vault.getFolder('g')!.parentId).toBeNull();
    expect(store.get(collectionViewKeyForSidebarRoot())?.sidebarOrder).toEqual(['f:alpha', 'f:g', 'f:b']);
  });

  it('nested expanded folders resolve to their own boundaries, chosen by how far right the pointer is', async () => {
    await build();
    press(rowFor('Gamma'), 40, 338);
    move(LEFT.deep + 4, END_Y);
    expect(insertLine()!.style.left).toBe(`${LEFT.deep}px`); // after Deep, inside Inner
    move(LEFT.inner + 4, END_Y);
    expect(insertLine()!.style.left).toBe(`${LEFT.inner}px`); // after Inner, inside Alpha
    move(LEFT.alpha + 4, END_Y);
    expect(insertLine()!.style.left).toBe(`${LEFT.alpha}px`); // after Alpha, at the root
    move(13, END_Y); // on the row but left of every indent: the outermost
    expect(insertLine()!.style.left).toBe(`${LEFT.alpha}px`);
  });

  it('each boundary is that folder\'s sibling position: a cross-parent drop moves into the PARENT of the folder, then places it', async () => {
    await build();
    const folderMove = vi.spyOn(env.folderOperations, 'move');
    press(rowFor('Gamma'), 40, 338);
    move(LEFT.inner + 4, END_Y); // after Inner → a child of Alpha
    release(LEFT.inner + 4, END_Y);
    await settle();

    expect(folderMove).toHaveBeenCalledExactlyOnceWith('g', 'alpha');
    expect(env.vault.getFolder('g')!.parentId).toBe('alpha');
    expect(store.get('folder:alpha')?.sidebarOrder).toEqual(['n:na', 'f:inner', 'f:g']);
  });

  it('the pointer on the last row\'s own area never targets that row or moves into the folder', async () => {
    await build();
    press(rowFor('Gamma'), 40, 338);
    for (let y = 269; y < 296; y++) {
      move(70, y); // across deep.png: upper part has no target, the bottom band the Deep boundary — never "inside"
      expect(feedbackNow().filter((f) => f.dataset.dropFeedback === 'inside')).toHaveLength(0);
    }
    move(70, 272);
    expect(feedbackNow()).toHaveLength(0); // the upper part of a file row is nothing
  });

  it('a note row in the middle of a subtree is a position of its own, not a folder boundary', async () => {
    await build();
    press(rowFor('Gamma'), 40, 338);
    move(LEFT.deep + 4, 266); // Note D's bottom edge (deep.png follows): a folder beside a note, inside Deep
    expect(feedbackNow()).toHaveLength(1);
    expect(insertLine()!.style.top).toBe('268px');
    expect(insertLine()!.style.left).toBe(`${LEFT.noteInDeep}px`);
  });

  it('a collapsed folder keeps its own after position, and the enclosing folder is one step left', async () => {
    await build(['inner']);
    // Alpha 100 · Note A 128 · Inner (collapsed) 156 · Beta 184 · Gamma 212 → Inner's bottom edge is 184.
    expect(rowTitles().slice(0, 5)).toEqual(['Alpha', 'Note A', 'Inner', 'Beta', 'Gamma']);

    press(rowFor('Gamma'), 40, 226);
    move(LEFT.inner + 4, 182);
    expect(insertLine()!.style.top).toBe('184px');
    expect(insertLine()!.style.left).toBe(`${LEFT.inner}px`);

    move(LEFT.alpha + 4, 182); // Inner is also the last row of Alpha's subtree
    expect(insertLine()!.style.left).toBe(`${LEFT.alpha}px`);
  });

  it('a note is offered the enclosing folders\' boundaries too — except those that would put it in the root', async () => {
    await build();
    press(rowFor('Note A'), 40, 142);
    move(20, END_Y); // the end of Alpha's, Inner's and Deep's subtrees; "after Alpha" is the root, so not for a note
    expect(insertLine()).toBeDefined();
    expect(insertLine()!.style.left).toBe(`${LEFT.inner}px`); // the outermost one a note may use: after Inner, inside Alpha
    move(LEFT.deep + 4, END_Y);
    expect(insertLine()!.style.left).toBe(`${LEFT.deep}px`);
  });

  it('an expanded folder\'s header has no "after" — at any nesting level; its only after position is the end of its subtree', async () => {
    await build();
    press(rowFor('Gamma'), 40, 338);
    for (const y of [126, 182, 238]) {
      move(70, y); // the bottom bands of the headers of Alpha (100), Inner (156) and Deep (212)
      expect(feedbackNow()).toHaveLength(0);
    }
    move(20, END_Y);
    expect(feedbackNow()).toHaveLength(1);
  });

  it('insertion immediately before an expanded folder works on its header\'s top edge, with a single indicator', async () => {
    await build();
    press(rowFor('Gamma'), 40, 338);
    for (const [y, top, label] of [
      [102, '100px', 'Alpha'],
      [158, '156px', 'Inner'],
      [214, '212px', 'Deep'],
    ] as const) {
      move(70, y);
      expect(feedbackNow(), label).toHaveLength(1);
      expect(insertLine()!.style.top, label).toBe(top);
    }
  });

  it('the middle of an expanded folder\'s header is still its folder-destination highlight', async () => {
    await build();
    press(rowFor('Gamma'), 40, 338);
    move(70, 170); // Inner's header, centre
    expect(feedbackNow()).toHaveLength(1);
    expect(feedbackNow()[0]).toHaveAttribute('data-drop-feedback', 'inside');
    expect(feedbackNow()[0]!.style.top).toBe('156px');
  });

  it('never targets inside the dragged folder\'s own subtree', async () => {
    await build();
    press(rowFor('Inner'), 40, 170);
    move(20, END_Y); // the end of Inner is also the end of Alpha's: after Alpha is a real move
    expect(insertLine()!.style.left).toBe(`${LEFT.alpha}px`);

    move(LEFT.inner + 4, END_Y); // after Inner itself: not a position (it is the dragged folder)
    expect(insertLine()!.style.left).toBe(`${LEFT.alpha}px`); // falls through to the only valid one
    move(LEFT.deep + 4, 266); // inside its own subtree
    expect(feedbackNow()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Resting on a collapsed "N more" row during a drag reveals the hidden items for the rest of that drag.
// ---------------------------------------------------------------------------------------------------------

describe('drag-hover reveal of "N more"', () => {
  // Alpha (expanded) lists 13 items by name: 0 Note, then folders A00…A11, of which A11 holds a note (Leaf). The cap shows 10:
  //   Alpha 100 · 0 Note 128 · A00 156 … A08 (156 + 8·28 = 380) · "3 more" 408
  // Revealed: A09 408 · A10 436 · A11 464 · Leaf 492 · "Show less" 520.
  const MORE_Y = 420;
  const names = Array.from({ length: 12 }, (_, i) => `A${String(i).padStart(2, '0')}`);

  async function build(extra: Partial<React.ComponentProps<typeof FolderTree>> = {}) {
    cleanup();
    env = setup(
      [makeFolder('a', `${ROOT}/Alpha`, null), ...names.map((name) => makeFolder(name, `${ROOT}/Alpha/${name}`, 'a'))],
      [makePage('nz', `${ROOT}/Alpha/0 Note.md`, 'a'), makePage('leaf', `${ROOT}/Alpha/A11/Leaf.md`, 'A11')]
    );
    store = await CollectionViewConfigStore.load(env.fileSystem, ROOT);
    makeManual(store, 'a');
    renderOrdered(env, store, extra);
  }

  const hasRow = (title: string) => rowTitles().includes(title);
  const elapse = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  const insertNow = () => feedbackNow().find((f) => f.dataset.dropFeedback === 'insert');
  const dragStart = (title: string) => press(rowFor(title), 40, rowFor(title).getBoundingClientRect().top + 14);

  // The tree indents a row by --space-6 + 24px per level; jsdom has no stylesheet, so the same formula stands in for it.
  const stubIndents = () => {
    const real = globalThis.getComputedStyle.bind(globalThis);
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(
      (element: Element) =>
        ({
          overflowY: real(element).overflowY, // (the auto-scroller looks for the scrolling ancestor with this)
          paddingLeft: `${6 + 24 * (Number((element as HTMLElement).style.getPropertyValue('--tree-level')) || 0)}px`,
        }) as CSSStyleDeclaration
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    stubIndents();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts capped: ten items and a "3 more" row', async () => {
    await build();
    expect(hasRow('A08')).toBe(true);
    expect(hasRow('A09')).toBe(false);
    expect(hasRow('3 more')).toBe(true);
  });

  it('hovering "N more" without a drag does not expand anything', async () => {
    await build();
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: MORE_Y }));
    elapse(DRAG_REVEAL_DELAY_MS * 3);
    expect(hasRow('A09')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('during a drag, resting on "N more" reveals the hidden items after the delay — not before', async () => {
    await build();
    dragStart('A00');
    move(60, MORE_Y);

    elapse(DRAG_REVEAL_DELAY_MS - 50);
    expect(hasRow('A09')).toBe(false);

    elapse(100);
    expect(['A09', 'A10', 'A11', 'Leaf']).toSatisfy((rows: string[]) => rows.every(hasRow));
    // The drag carries on as before: ghost present, the original still invisible and in place.
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    expect(rowFor('A00')).toHaveClass('entry--drag-source');
  });

  it('leaving "N more" before the delay cancels the reveal', async () => {
    await build();
    dragStart('A00');
    move(60, MORE_Y);
    elapse(DRAG_REVEAL_DELAY_MS - 100);
    move(60, 300);
    elapse(DRAG_REVEAL_DELAY_MS * 2);

    expect(hasRow('A09')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expanding moves nothing and writes nothing', async () => {
    await build();
    const folderMove = vi.spyOn(env.folderOperations, 'move');
    dragStart('A00');
    move(60, MORE_Y);
    elapse(DRAG_REVEAL_DELAY_MS + 1);

    expect(hasRow('A09')).toBe(true);
    expect(folderMove).not.toHaveBeenCalled();
    expect(env.enqueueSpy).not.toHaveBeenCalled();
    expect(store.get('folder:a')?.sidebarOrder).toBeUndefined();
  });

  it('stays expanded for the rest of the drag, even after the pointer leaves "N more"', async () => {
    await build();
    dragStart('A00');
    move(60, MORE_Y);
    elapse(DRAG_REVEAL_DELAY_MS + 1);
    move(60, 190);
    move(500, 190);
    elapse(DRAG_REVEAL_DELAY_MS * 4);

    expect(hasRow('A11')).toBe(true);
  });

  it('the revealed items are drop targets, found without moving the pointer once they appear', async () => {
    await build();
    dragStart('A00');
    move(60, MORE_Y); // resting on "3 more"
    expect(feedbackNow()).toHaveLength(0);

    elapse(DRAG_REVEAL_DELAY_MS + 1); // A09 now sits under the still pointer (408–436): its centre
    expect(feedbackNow()).toHaveLength(1);
    expect(feedbackNow()[0]).toHaveAttribute('data-drop-feedback', 'inside');
    expect(feedbackNow()[0]!.style.top).toBe('408px');

    move(60, 438); // A10's top edge
    expect(insertNow()!.style.top).toBe('436px');
    move(60, 450); // A10's centre
    expect(feedbackNow()[0]).toHaveAttribute('data-drop-feedback', 'inside');
  });

  it('the last revealed sibling is a valid insertion target — after its whole expanded subtree', async () => {
    await build();
    dragStart('A00');
    move(60, MORE_Y);
    elapse(DRAG_REVEAL_DELAY_MS + 1);

    move(60, 490); // A11's header bottom edge… A11 is expanded: nothing
    expect(feedbackNow().filter((f) => f.dataset.dropFeedback === 'insert')).toHaveLength(0);
    move(45, 518); // Leaf's bottom edge, left of Leaf's indent: the end of A11's subtree, beside A11
    expect(insertNow()).toBeDefined();
    expect(insertNow()!.style.top).toBe('520px');

    release(45, 518);
    await vi.waitFor(() => expect(store.get('folder:a')?.sidebarOrder?.slice(-2)).toEqual(['f:A11', 'f:A00']));
  });

  it('mixed kinds among the revealed rows: a note beside a folder, or inside it', async () => {
    await build();
    dragStart('0 Note');
    move(60, MORE_Y);
    elapse(DRAG_REVEAL_DELAY_MS + 1);

    move(60, 438); // the top edge of a revealed folder: a note may be placed beside a folder
    expect(feedbackNow()[0]).toHaveAttribute('data-drop-feedback', 'insert');
    move(60, 450); // its centre: it may go inside
    expect(feedbackNow()[0]).toHaveAttribute('data-drop-feedback', 'inside');
  });

  it.each([
    ['release', () => release(500, 5)],
    ['Escape', () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }))],
    ['pointercancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
  ])('%s puts the list back to its ten items and leaves no timer behind', async (_name, end) => {
    await build();
    dragStart('A00');
    move(60, MORE_Y);
    elapse(DRAG_REVEAL_DELAY_MS + 1);
    expect(hasRow('A11')).toBe(true);

    end();
    expect(hasRow('A11')).toBe(false);
    expect(hasRow('3 more')).toBe(true);
    elapse(1); // (the drag's own one-shot click swallower disarms on the next tick)
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a drag that ends while still waiting leaves no timer that could fire later', async () => {
    await build();
    dragStart('A00');
    move(60, MORE_Y);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    release(60, MORE_Y);
    elapse(1); // (the drag's own one-shot click swallower disarms on the next tick)
    expect(vi.getTimerCount()).toBe(0);
    elapse(DRAG_REVEAL_DELAY_MS * 2);
    expect(hasRow('A09')).toBe(false);
  });

  it('unmounting mid-drag clears the timer and the reveal', async () => {
    await build();
    dragStart('A00');
    move(60, MORE_Y);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    elapse(DRAG_REVEAL_DELAY_MS * 2); // must not throw or update an unmounted tree
  });

  it('keeps an expansion the user already had: the drag neither adds to it nor removes it', async () => {
    await build({ expandedFolders: ['a'] });
    expect(hasRow('A11')).toBe(true);
    expect(hasRow('3 more')).toBe(false); // already expanded: a "Show less" row instead

    dragStart('A00');
    move(60, 300);
    elapse(DRAG_REVEAL_DELAY_MS * 2);
    release(60, 300);

    expect(hasRow('A11')).toBe(true);
    expect(hasRow('Show less')).toBe(true);
  });

  it('is exclusive to the Notes tree: without enableDrag a "N more" row is not a hover target', async () => {
    await build({ enableDrag: false });
    expect(document.querySelector('[data-cap-key]')).toBeNull();
    press(rowFor('A00'));
    move(60, MORE_Y);
    elapse(DRAG_REVEAL_DELAY_MS * 2);
    expect(hasRow('A09')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Edge auto-scroll: near the top or bottom of the scrolling list, a drag scrolls it toward the pointer.
// ---------------------------------------------------------------------------------------------------------

describe('auto-scroll while dragging', () => {
  // The same Alpha as the "N more" tests (13 items, cap 10), inside a 300px-tall scroller at y=100…400:
  // its bottom zone is y 344–400, its top zone y 100–156. Row i sits at 100 + 28·i − scrollTop.
  const names = Array.from({ length: 12 }, (_, i) => `A${String(i).padStart(2, '0')}`);
  let scrollTop = 0;
  let maxScroll = 300;
  let bounds = { top: 100, bottom: 400 };
  let scroller: HTMLElement;

  async function build(options: { bounds?: { top: number; bottom: number }; start?: number; max?: number } = {}) {
    cleanup();
    scrollTop = options.start ?? 0;
    maxScroll = options.max ?? 300;
    bounds = options.bounds ?? { top: 100, bottom: 400 };
    env = setup(
      [makeFolder('a', `${ROOT}/Alpha`, null), ...names.map((name) => makeFolder(name, `${ROOT}/Alpha/${name}`, 'a'))],
      [makePage('nz', `${ROOT}/Alpha/0 Note.md`, 'a'), makePage('leaf', `${ROOT}/Alpha/A11/Leaf.md`, 'A11')]
    );
    store = await CollectionViewConfigStore.load(env.fileSystem, ROOT);
    makeManual(store, 'a');
    scroller = renderOrdered(env, store).container;
    scroller.setAttribute('data-test-scroller', '');
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.min(maxScroll, Math.max(0, value));
      },
    });
    scroller.getBoundingClientRect = () =>
      ({ left: 0, right: 260, ...bounds, x: 0, y: bounds.top, width: 260, height: bounds.bottom - bounds.top, toJSON: () => ({}) }) as DOMRect;
  }

  const frames = (n: number) => act(() => void vi.advanceTimersByTime(n * 17));
  const hasRow = (title: string) => rowTitles().includes(title);
  const dragStart = (title: string) => press(rowFor(title), 40, rowFor(title).getBoundingClientRect().top + 14);

  // The tree indents a row by --space-6 + 24px per level; jsdom has no stylesheet, so the same formula stands in for it.
  const stubIndents = () => {
    const real = globalThis.getComputedStyle.bind(globalThis);
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(
      (element: Element) =>
        ({
          overflowY: real(element).overflowY, // (the auto-scroller looks for the scrolling ancestor with this)
          paddingLeft: `${6 + 24 * (Number((element as HTMLElement).style.getPropertyValue('--tree-level')) || 0)}px`,
        }) as CSSStyleDeclaration
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    stubIndents();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('scrolls down while the pointer rests in the bottom zone', async () => {
    await build();
    dragStart('A00');
    move(60, 390);
    frames(6);
    expect(scrollTop).toBeGreaterThan(0);
  });

  it('scrolls up while the pointer rests in the top zone, down to the top', async () => {
    await build({ start: 120 });
    dragStart('A05');
    move(60, 110);
    frames(40);
    expect(scrollTop).toBe(0);
  });

  it('does not scroll anywhere else — the middle of the list, or beside it — and holds no frame while idle', async () => {
    await build({ start: 100 });
    dragStart('A05');
    move(60, 250);
    frames(10);
    move(500, 395); // below the zone's x range: the pointer has left the sidebar
    frames(10);
    expect(scrollTop).toBe(100);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing when no drag is active — not on pointer movement, not on a press that never became a drag', async () => {
    await build();
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: 395 }));
    frames(10);
    expect(scrollTop).toBe(0);

    press(rowFor('A00'), 40, 170);
    move(41, 395 - 200); // under the threshold: still just a press
    frames(10);
    expect(scrollTop).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops at the bottom limit, and the top limit, with no loop left running', async () => {
    await build({ max: 40 });
    dragStart('A00');
    move(60, 399);
    frames(30);
    expect(scrollTop).toBe(40);
    expect(vi.getTimerCount()).toBe(0);

    move(60, 101);
    frames(30);
    expect(scrollTop).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('speeds up toward the edge', async () => {
    await build();
    dragStart('A00');
    move(60, 350); // the inner edge of the zone
    frames(4);
    const slow = scrollTop;

    scrollTop = 0;
    move(60, 399); // the very edge
    frames(4);
    expect(scrollTop).toBeGreaterThan(slow);
  });

  it('the target follows the content: a stationary pointer lands on different rows as the list scrolls', async () => {
    await build();
    dragStart('A00');
    move(60, 390); // row i at 100 + 28i: index 10 is 380–408 — A08, centre-ish: inside
    expect(feedbackNow()[0]).toHaveAttribute('data-drop-feedback', 'inside');
    expect(feedbackNow()[0]!.style.top).toBe('380px');
    const shown = () => `${feedbackNow()[0]?.dataset.dropFeedback}@${feedbackNow()[0]?.style.top}`;
    const before = shown();

    frames(4);
    expect(scrollTop).toBeGreaterThan(0);
    expect(feedbackNow()).toHaveLength(1); // still exactly one indicator…
    expect(shown()).not.toBe(before); // …recomputed for the rows now under the unmoved pointer
  });

  it('the ghost stays on the pointer while the list scrolls under it', async () => {
    await build();
    dragStart('A00'); // grabbed 14px down its row
    move(60, 390);
    const before = document.querySelector<HTMLElement>('.drag-ghost')!.style.transform;
    frames(6);

    expect(scrollTop).toBeGreaterThan(0);
    expect(document.querySelector<HTMLElement>('.drag-ghost')!.style.transform).toBe(before);
    expect(before).toBe('translate3d(0, 376px, 0)'); // pinned to the sidebar column while over it: 390 − the 14px grip, 390 − 14
  });

  it('re-reads the scroller\'s size every frame: a resize during the drag stops a scroll that no longer applies', async () => {
    await build();
    dragStart('A00');
    move(60, 390);
    frames(3);
    const reached = scrollTop;
    expect(reached).toBeGreaterThan(0);

    bounds = { top: 100, bottom: 800 }; // the sidebar grew: 390 is far from its bottom
    frames(6);
    expect(scrollTop).toBe(reached);
  });

  it('works together with the temporary "N more" reveal, and reaches the revealed rows', async () => {
    await build({ bounds: { top: 100, bottom: 560 }, max: 200 });
    dragStart('A00');
    move(60, 420); // resting on "3 more" (408–436), outside both zones (156 / 504)
    act(() => void vi.advanceTimersByTime(DRAG_REVEAL_DELAY_MS + 1));
    expect(hasRow('A11')).toBe(true);
    expect(scrollTop).toBe(0);

    move(60, 545); // now in the bottom zone, over the revealed list
    frames(8);
    expect(scrollTop).toBeGreaterThan(0);
    expect(hasRow('A11')).toBe(true); // still revealed while scrolling
    expect(feedbackNow().length).toBeLessThanOrEqual(1);
  });

  it('can drop on a row that was only reachable by scrolling', async () => {
    await build({ bounds: { top: 100, bottom: 560 }, max: 200 });
    dragStart('A00');
    move(60, 420);
    act(() => void vi.advanceTimersByTime(DRAG_REVEAL_DELAY_MS + 1));
    move(60, 555);
    frames(30); // all the way down
    expect(scrollTop).toBe(200);

    // After the end-of-list scroll Leaf's bottom edge (492 + 28 − 200 = 320) is well inside the list.
    move(45, 318);
    expect(feedbackNow()[0]).toHaveAttribute('data-drop-feedback', 'insert');
    release(45, 318);
    await vi.waitFor(() => expect(store.get('folder:a')?.sidebarOrder?.slice(-2)).toEqual(['f:A11', 'f:A00']));
  });

  it.each([
    ['release', () => release(60, 390)],
    ['Escape', () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }))],
    ['pointercancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
    ['window blur', () => act(() => void fireEvent.blur(window))],
  ])('%s stops the scrolling for good', async (_name, end) => {
    await build();
    dragStart('A00');
    move(60, 395);
    frames(3);
    const reached = scrollTop;
    expect(reached).toBeGreaterThan(0);

    end();
    act(() => void vi.advanceTimersByTime(1)); // (the drag's own one-shot click swallower)
    frames(10);
    expect(scrollTop).toBe(reached);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unmounting mid-scroll cancels the frame', async () => {
    await build();
    dragStart('A00');
    move(60, 395);
    frames(2);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves ordinary scrolling alone after the drag: nothing listens, nothing moves it', async () => {
    await build();
    dragStart('A00');
    move(60, 395);
    frames(2);
    release(60, 395);
    act(() => void vi.advanceTimersByTime(1));
    scrollTop = 50; // the user scrolls by hand
    act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: 395 }));
    frames(10);
    expect(scrollTop).toBe(50);
  });
});
