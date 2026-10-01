import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceSessionStore, type WorkspaceSessionOwners } from './WorkspaceSessionStore';
import { DailyNotesSidebarState } from '../daily-notes/DailyNotesSidebarState';
import { Workspace, type ActiveView } from '../../workspace/Workspace';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

function fileWith(workspaceSession: unknown, extra: Record<string, unknown> = {}) {
  return new InMemoryVaultFileSystem({
    [WORKSPACE_PATH]: JSON.stringify({ ...extra, workspaceSession }),
  });
}

async function readFile(fileSystem: InMemoryVaultFileSystem): Promise<Record<string, unknown>> {
  return JSON.parse(await fileSystem.readFile(WORKSPACE_PATH)) as Record<string, unknown>;
}

function owners(overrides: Partial<WorkspaceSessionOwners> = {}): WorkspaceSessionOwners {
  return {
    workspace: new Workspace(),
    dailyNotesSidebarState: new DailyNotesSidebarState(),
    isPersistableView: () => true,
    ...overrides,
  };
}

const FULL_SESSION = {
  version: 1,
  navigation: {
    activeSidebarTab: 'notes',
    activeView: { type: 'page', id: 'p1' },
  },
  sidebar: {
    visible: false,
    collapsedSections: ['favorites'],
    notes: { collapsedFolderIds: ['f1', 'f2'] },
    dailyNotes: { earlierExpanded: true, upcomingExpanded: false },
  },
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

describe('WorkspaceSessionStore — load()', () => {
  it('a vault with no workspace.json restores nothing', async () => {
    const store = await WorkspaceSessionStore.load(new InMemoryVaultFileSystem(), ROOT);

    expect(store.restoredSession).toEqual({
      activeView: null,
      collapsedSections: [],
      collapsedFolderIds: [],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads every field of a well-formed v1 session', async () => {
    const store = await WorkspaceSessionStore.load(fileWith(FULL_SESSION), ROOT);

    expect(store.restoredSession).toEqual({
      activeSidebarTab: 'notes',
      activeView: { type: 'page', id: 'p1' },
      sidebarVisible: false,
      collapsedSections: ['favorites'],
      collapsedFolderIds: ['f1', 'f2'],
      dailyNotesEarlierExpanded: true,
      dailyNotesUpcomingExpanded: false,
    });
  });

  it('invalid JSON restores nothing and warns, never throws', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [WORKSPACE_PATH]: '{not json' });

    const store = await WorkspaceSessionStore.load(fileSystem, ROOT);

    expect(store.restoredSession.activeView).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('a non-object workspaceSession restores nothing', async () => {
    const store = await WorkspaceSessionStore.load(fileWith(['nope']), ROOT);

    expect(store.restoredSession.collapsedFolderIds).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('a session written by a newer version restores nothing (downgrade)', async () => {
    const store = await WorkspaceSessionStore.load(fileWith({ ...FULL_SESSION, version: 2 }), ROOT);

    expect(store.restoredSession.activeSidebarTab).toBeUndefined();
    expect(store.restoredSession.activeView).toBeNull();
  });

  it('a missing version reads as version 1', async () => {
    const { version: _version, ...unversioned } = FULL_SESSION;
    const store = await WorkspaceSessionStore.load(fileWith(unversioned), ROOT);

    expect(store.restoredSession.activeSidebarTab).toBe('notes');
  });

  it('one malformed field falls back alone — valid siblings survive', async () => {
    const store = await WorkspaceSessionStore.load(
      fileWith({
        ...FULL_SESSION,
        navigation: { activeSidebarTab: 42, activeView: { type: 'page', id: 'p1' } },
        sidebar: { ...FULL_SESSION.sidebar, visible: 'yes' },
      }),
      ROOT
    );

    expect(store.restoredSession.activeSidebarTab).toBeUndefined();
    expect(store.restoredSession.sidebarVisible).toBeUndefined();
    expect(store.restoredSession.activeView).toEqual({ type: 'page', id: 'p1' });
    expect(store.restoredSession.collapsedFolderIds).toEqual(['f1', 'f2']);
    expect(store.restoredSession.dailyNotesEarlierExpanded).toBe(true);
  });

  it('a malformed section falls back alone — other sections survive', async () => {
    const store = await WorkspaceSessionStore.load(
      fileWith({ ...FULL_SESSION, sidebar: { ...FULL_SESSION.sidebar, dailyNotes: 'broken' } }),
      ROOT
    );

    expect(store.restoredSession.dailyNotesEarlierExpanded).toBeUndefined();
    expect(store.restoredSession.collapsedSections).toEqual(['favorites']);
  });

  it('an unknown sidebar tab is ignored', async () => {
    const store = await WorkspaceSessionStore.load(
      fileWith({ ...FULL_SESSION, navigation: { activeSidebarTab: 'calendar', activeView: null } }),
      ROOT
    );

    expect(store.restoredSession.activeSidebarTab).toBeUndefined();
  });

  it('drops non-string entries from id lists without discarding the rest', async () => {
    const store = await WorkspaceSessionStore.load(
      fileWith({
        ...FULL_SESSION,
        sidebar: { ...FULL_SESSION.sidebar, notes: { collapsedFolderIds: ['f1', 7, null, 'f2'] } },
      }),
      ROOT
    );

    expect(store.restoredSession.collapsedFolderIds).toEqual(['f1', 'f2']);
  });

  it.each([
    [{ type: 'folder', id: 'f1' }, { type: 'folder', id: 'f1' }],
    [
      { type: 'filtered-view', view: { kind: 'favorites' } },
      { type: 'filtered-view', view: { kind: 'favorites' } },
    ],
    [
      { type: 'filtered-view', view: { kind: 'tag', tagName: 'design' } },
      { type: 'filtered-view', view: { kind: 'tag', tagName: 'design' } },
    ],
  ])('accepts a well-formed active view %#', async (stored, expected) => {
    const store = await WorkspaceSessionStore.load(
      fileWith({ ...FULL_SESSION, navigation: { activeView: stored } }),
      ROOT
    );

    expect(store.restoredSession.activeView).toEqual(expected);
  });

  it.each([
    [{ type: 'page' }],
    [{ type: 'page', id: '' }],
    [{ type: 'window', id: 'x' }],
    [{ type: 'filtered-view', view: { kind: 'calendar' } }],
    [{ type: 'filtered-view', view: { kind: 'tag' } }],
    ['p1'],
  ])('rejects a malformed active view %#', async (stored) => {
    const store = await WorkspaceSessionStore.load(
      fileWith({ ...FULL_SESSION, navigation: { activeView: stored } }),
      ROOT
    );

    expect(store.restoredSession.activeView).toBeNull();
  });
});

describe('WorkspaceSessionStore — seed()', () => {
  it('applies the restored chrome state to the runtime owners, but not the active view', async () => {
    const store = await WorkspaceSessionStore.load(fileWith(FULL_SESSION), ROOT);
    const workspace = new Workspace();
    const dailyNotes = new DailyNotesSidebarState();

    store.seed(workspace, dailyNotes, () => true);

    expect(workspace.activeSidebarTab).toBe('notes');
    expect(workspace.isSidebarVisible).toBe(false);
    expect(workspace.isSectionExpanded('favorites')).toBe(false);
    expect(workspace.isFolderExpanded('f1')).toBe(false);
    expect(workspace.isFolderExpanded('f2')).toBe(false);
    expect(dailyNotes.earlierExpanded).toBe(true);
    expect(dailyNotes.upcomingExpanded).toBe(false);
    expect(workspace.activeView).toBeNull();
  });

  it('skips collapsed folder ids that no longer exist in the Vault', async () => {
    const store = await WorkspaceSessionStore.load(fileWith(FULL_SESSION), ROOT);
    const workspace = new Workspace();

    store.seed(workspace, new DailyNotesSidebarState(), (id) => id === 'f1');

    expect(workspace.collapsedFolders).toEqual(['f1']);
  });

  it('leaves runtime defaults alone for fields that were absent or malformed', async () => {
    const store = await WorkspaceSessionStore.load(fileWith({ version: 1 }), ROOT);
    const workspace = new Workspace();
    const dailyNotes = new DailyNotesSidebarState();

    store.seed(workspace, dailyNotes, () => true);

    expect(workspace.activeSidebarTab).toBe('daily-notes');
    expect(workspace.isSidebarVisible).toBe(true);
    expect(dailyNotes.earlierExpanded).toBe(false);
  });
});

describe('WorkspaceSessionStore — attach()/persistence', () => {
  it('writes nothing before attach(), even when the runtime owners change', async () => {
    vi.useFakeTimers();
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await WorkspaceSessionStore.load(fileSystem, ROOT);
    const session = owners();

    store.seed(session.workspace, session.dailyNotesSidebarState, () => true);
    session.workspace.setActiveSidebarTab('tags');
    await vi.runAllTimersAsync();

    expect(await fileSystem.exists(WORKSPACE_PATH)).toBe(false);
  });

  it('debounces changes into a single write of the full v1 shape', async () => {
    vi.useFakeTimers();
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await WorkspaceSessionStore.load(fileSystem, ROOT);
    const session = owners();
    const writeFile = vi.spyOn(fileSystem, 'writeFile');

    store.attach(session);
    session.workspace.setActiveSidebarTab('tasks');
    session.workspace.setFolderExpanded('f9', false);
    session.workspace.openFolder('f9');
    session.dailyNotesSidebarState.setUpcomingExpanded(true);
    expect(writeFile).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect((await readFile(fileSystem)).workspaceSession).toEqual({
      version: 1,
      navigation: { activeSidebarTab: 'tasks', activeView: { type: 'folder', id: 'f9' } },
      sidebar: {
        visible: true,
        collapsedSections: [],
        notes: { collapsedFolderIds: ['f9'] },
        dailyNotes: { earlierExpanded: false, upcomingExpanded: true },
      },
    });
  });

  it('never persists a draft as the active view', async () => {
    vi.useFakeTimers();
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await WorkspaceSessionStore.load(fileSystem, ROOT);
    const session = owners({
      isPersistableView: (view: ActiveView) => !(view.type === 'page' && view.id === 'draft-1'),
    });

    store.attach(session);
    session.workspace.openPage('draft-1');
    await vi.runAllTimersAsync();

    const written = (await readFile(fileSystem)).workspaceSession as {
      navigation: { activeView: unknown };
    };
    expect(written.navigation.activeView).toBeNull();
  });

  it('skips the write when nothing persisted changed', async () => {
    vi.useFakeTimers();
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await WorkspaceSessionStore.load(fileSystem, ROOT);
    const session = owners();
    store.attach(session);
    await vi.runAllTimersAsync();
    const writeFile = vi.spyOn(fileSystem, 'writeFile');

    // refresh() fires notify() without changing any persisted field.
    session.workspace.refresh();
    await vi.runAllTimersAsync();

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('flush() writes a pending change immediately, without waiting for the debounce', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await WorkspaceSessionStore.load(fileSystem, ROOT);
    const session = owners();
    store.attach(session);
    session.workspace.setActiveSidebarTab('tags');

    await store.flush();

    const written = (await readFile(fileSystem)).workspaceSession as {
      navigation: { activeSidebarTab: string };
    };
    expect(written.navigation.activeSidebarTab).toBe('tags');
    store.dispose();
  });

  it('preserves sibling workspace.json keys owned by other stores', async () => {
    const fileSystem = fileWith(FULL_SESSION, { tagExpansion: ['design'], foldState: {} });
    const store = await WorkspaceSessionStore.load(fileSystem, ROOT);
    store.attach(owners());

    await store.flush();

    const file = await readFile(fileSystem);
    expect(file.tagExpansion).toEqual(['design']);
    expect(file.foldState).toEqual({});
    store.dispose();
  });

  it('round-trips across a simulated restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const first = await WorkspaceSessionStore.load(fileSystem, ROOT);
    const session = owners();
    first.attach(session);
    session.workspace.setActiveSidebarTab('tags');
    session.workspace.setSidebarVisible(false);
    session.workspace.setSectionExpanded('folders', false);
    session.workspace.openFilteredView({ kind: 'tag', tagName: 'design' });
    session.dailyNotesSidebarState.setEarlierExpanded(true);
    await first.flush();
    first.dispose();

    const second = await WorkspaceSessionStore.load(fileSystem, ROOT);

    expect(second.restoredSession).toEqual({
      activeSidebarTab: 'tags',
      activeView: { type: 'filtered-view', view: { kind: 'tag', tagName: 'design' } },
      sidebarVisible: false,
      collapsedSections: ['folders'],
      collapsedFolderIds: [],
      dailyNotesEarlierExpanded: true,
      dailyNotesUpcomingExpanded: false,
    });
  });

  it('dispose() stops observing and drops a pending write', async () => {
    vi.useFakeTimers();
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await WorkspaceSessionStore.load(fileSystem, ROOT);
    const session = owners();
    store.attach(session);
    session.workspace.setActiveSidebarTab('tags');

    store.dispose();
    session.workspace.setActiveSidebarTab('tasks');
    await vi.runAllTimersAsync();

    expect(await fileSystem.exists(WORKSPACE_PATH)).toBe(false);
  });
});
