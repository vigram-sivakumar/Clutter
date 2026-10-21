import { describe, expect, it } from 'vitest';

import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import {
  migrateRenamedRootState,
  remapPathDerivedId,
  remapRenamedRootState,
} from './migrateRenamedRootState';

const OLD = '/s/Notes';
const NEW = '/s/Journal';
const STATE_PATH = `${NEW}/.clutter/workspace.json`;

/** A path-derived id (the absolute path) and a stable one (a frontmatter uuid). */
const derived = (rest: string) => `${OLD}/${rest}`;
const moved = (rest: string) => `${NEW}/${rest}`;
const STABLE = '0b1f6d9e-6c1a-4a39-9d3f-2f1c9a7e5a10';

const patch = (file: Record<string, unknown>) => remapRenamedRootState(file, OLD, NEW);

describe('remapPathDerivedId', () => {
  it('rewrites an id that is a path inside the old root, and nothing else', () => {
    expect(remapPathDerivedId(derived('Projects/a.md'), OLD, NEW)).toBe(moved('Projects/a.md'));
    expect(remapPathDerivedId(STABLE, OLD, NEW)).toBe(STABLE);
  });

  it('needs the separator: a sibling that merely starts with the old name is not inside it', () => {
    expect(remapPathDerivedId('/s/Notes 2/a.md', OLD, NEW)).toBe('/s/Notes 2/a.md');
    expect(remapPathDerivedId(OLD, OLD, NEW)).toBe(OLD); // the root itself is not an id of anything saved
  });
});

describe('remapRenamedRootState: one handler per store, against that store’s own shape', () => {
  it('WorkspaceSessionStore: the open page or folder and the collapsed folders', () => {
    const result = patch({
      workspaceSession: {
        version: 1,
        navigation: { activeSidebarTab: 'notes', activeView: { type: 'page', id: derived('a.md') } },
        sidebar: {
          visible: true,
          collapsedSections: ['notes'],
          notes: { collapsedFolderIds: [derived('Projects'), STABLE] },
          dailyNotes: { earlierExpanded: false, upcomingExpanded: true },
        },
      },
    });

    expect(result.workspaceSession).toEqual({
      version: 1,
      navigation: { activeSidebarTab: 'notes', activeView: { type: 'page', id: moved('a.md') } },
      sidebar: {
        visible: true,
        collapsedSections: ['notes'],
        notes: { collapsedFolderIds: [moved('Projects'), STABLE] },
        dailyNotes: { earlierExpanded: false, upcomingExpanded: true },
      },
    });
  });

  it('WorkspaceSessionStore: a stable id, or a filtered view, is left exactly as it is', () => {
    expect(
      patch({ workspaceSession: { navigation: { activeView: { type: 'folder', id: STABLE } }, sidebar: { notes: { collapsedFolderIds: [STABLE] } } } })
    ).toEqual({});
    expect(patch({ workspaceSession: { navigation: { activeView: { type: 'filtered-view', view: { kind: 'tasks' } } } } })).toEqual({});
  });

  it('CollectionViewConfigStore: the folder entry’s key and its manual order, never other keys', () => {
    const result = patch({
      collectionViewConfig: {
        [`folder:${derived('Projects')}`]: {
          layout: 'list',
          sort: { key: 'name' },
          sidebarOrder: [derived('Projects/a.md'), STABLE],
        },
        [`folder:${STABLE}`]: { sidebarOrder: [derived('b.md')] },
        'view:tasks': { layout: 'board' },
        'tag:project': { layout: 'list' },
      },
    });

    expect(result.collectionViewConfig).toEqual({
      [`folder:${moved('Projects')}`]: { layout: 'list', sort: { key: 'name' }, sidebarOrder: [moved('Projects/a.md'), STABLE] },
      [`folder:${STABLE}`]: { sidebarOrder: [moved('b.md')] },
      'view:tasks': { layout: 'board' },
      'tag:project': { layout: 'list' },
    });
  });

  it('FoldStateStore: fold state per page, and embed collapse per host and embedded page', () => {
    const result = patch({
      foldState: { [derived('a.md')]: [1, 5], [STABLE]: [2, 3] },
      embedCollapse: { [derived('host.md')]: { [derived('emb.md')]: true, [STABLE]: false } },
    });

    expect(result.foldState).toEqual({ [moved('a.md')]: [1, 5], [STABLE]: [2, 3] });
    expect(result.embedCollapse).toEqual({ [moved('host.md')]: { [moved('emb.md')]: true, [STABLE]: false } });
  });

  it('ReferencesDisplayStore: display choices per page', () => {
    expect(patch({ referencesDisplay: { [derived('a.md')]: { hidden: true } } }).referencesDisplay).toEqual({
      [moved('a.md')]: { hidden: true },
    });
  });

  it('TemplateUsageStore: last-used times per template page', () => {
    expect(patch({ templateUsage: { [derived('Templates/t.md')]: 1700000000000, [STABLE]: 5 } }).templateUsage).toEqual({
      [moved('Templates/t.md')]: 1700000000000,
      [STABLE]: 5,
    });
  });

  it('PreferredTemplatesStore: both lists and the default daily-note template, in order', () => {
    const result = patch({
      preferredTemplates: [derived('Templates/a.md'), STABLE, derived('Templates/b.md')],
      preferredNoteTemplates: [STABLE, derived('Templates/c.md')],
      defaultDailyNoteTemplate: derived('Templates/a.md'),
    });

    expect(result).toEqual({
      preferredTemplates: [moved('Templates/a.md'), STABLE, moved('Templates/b.md')],
      preferredNoteTemplates: [STABLE, moved('Templates/c.md')],
      defaultDailyNoteTemplate: moved('Templates/a.md'),
    });
  });

  it('SpaceProfileStore: only the default note folder; the Space’s own id, avatar and settings are untouched', () => {
    const space = {
      version: 1,
      id: 'space-1',
      avatar: { type: 'image', src: 'Assets/avatar.png' },
      defaultNoteFolderId: derived('Projects'),
      defaultCoverPosition: 'above',
      autoDeleteArchived: true,
    };

    expect(patch({ space }).space).toEqual({ ...space, defaultNoteFolderId: moved('Projects') });
  });

  it('does not touch other keys, even ones that look like paths: only the keys a store owns are visited', () => {
    expect(
      patch({
        tasksViewConfig: { sort: derived('x') },
        notes: derived('free text'),
        somethingNew: { id: derived('y') },
      })
    ).toEqual({});
  });

  it('returns nothing when nothing is path-derived, and tolerates malformed shapes without throwing', () => {
    expect(patch({ foldState: { [STABLE]: [1, 2] }, preferredTemplates: [STABLE] })).toEqual({});
    expect(() =>
      patch({ workspaceSession: 5, collectionViewConfig: [1], foldState: 'x', preferredTemplates: {}, space: null, templateUsage: null })
    ).not.toThrow();
  });
});

describe('migrateRenamedRootState on a real state file', () => {
  const seed = (state: object) => new InMemoryVaultFileSystem({ [STATE_PATH]: JSON.stringify(state) });
  const read = async (fileSystem: InMemoryVaultFileSystem) => JSON.parse(await fileSystem.readFile(STATE_PATH));

  it('rewrites the ids, keeps every other key as it was, and preserves the Space id', async () => {
    const fileSystem = seed({
      space: { version: 1, id: 'space-1', defaultNoteFolderId: derived('Inbox') },
      foldState: { [derived('a.md')]: [1, 2] },
      tasksViewConfig: { sort: 'due' },
      unknownKeyFromANewerVersion: { keep: derived('me') },
    });

    expect(await migrateRenamedRootState(fileSystem, OLD, NEW)).toBe(true);

    expect(await read(fileSystem)).toEqual({
      space: { version: 1, id: 'space-1', defaultNoteFolderId: moved('Inbox') },
      foldState: { [moved('a.md')]: [1, 2] },
      tasksViewConfig: { sort: 'due' },
      unknownKeyFromANewerVersion: { keep: derived('me') },
    });
  });

  it('writes nothing when there is nothing to carry over', async () => {
    const fileSystem = seed({ space: { version: 1, id: 'space-1' }, foldState: { [STABLE]: [1] } });
    const before = await fileSystem.readFile(STATE_PATH);

    expect(await migrateRenamedRootState(fileSystem, OLD, NEW)).toBe(true);

    expect(await fileSystem.readFile(STATE_PATH)).toBe(before);
  });

  it('a Space with no state file has nothing to migrate and is left without one', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    expect(await migrateRenamedRootState(fileSystem, OLD, NEW)).toBe(true);

    expect(await fileSystem.exists(STATE_PATH)).toBe(false);
  });

  it('a state file that is not valid JSON is left alone, as the stores read it as empty too', async () => {
    const fileSystem = new InMemoryVaultFileSystem({ [STATE_PATH]: '{ not json' });

    expect(await migrateRenamedRootState(fileSystem, OLD, NEW)).toBe(true);

    expect(await fileSystem.readFile(STATE_PATH)).toBe('{ not json');
  });

  it('reports a failure to write instead of throwing, so the caller can tell the user', async () => {
    class Failing extends InMemoryVaultFileSystem {
      override async writeFile(): Promise<void> {
        throw new Error('disk full');
      }
    }
    const fileSystem = new Failing({ [STATE_PATH]: JSON.stringify({ foldState: { [derived('a.md')]: [1] } }) });

    expect(await migrateRenamedRootState(fileSystem, OLD, NEW)).toBe(false);
  });

  it('is idempotent: running it again changes nothing and never doubles a path', async () => {
    const fileSystem = seed({
      foldState: { [derived('a.md')]: [1, 2] },
      preferredTemplates: [derived('t.md'), STABLE],
      space: { version: 1, id: 'space-1', defaultNoteFolderId: derived('Inbox') },
    });

    await migrateRenamedRootState(fileSystem, OLD, NEW);
    const once = await fileSystem.readFile(STATE_PATH);
    await migrateRenamedRootState(fileSystem, OLD, NEW);
    await migrateRenamedRootState(fileSystem, OLD, NEW);

    expect(await fileSystem.readFile(STATE_PATH)).toBe(once);
    expect(JSON.parse(once).foldState).toEqual({ [moved('a.md')]: [1, 2] });
    expect(JSON.stringify(JSON.parse(once))).not.toContain(`${NEW}${NEW}`);
    expect(JSON.stringify(JSON.parse(once))).not.toContain(OLD);
  });

  it('a failed write leaves the file exactly as it was, and a retry then completes it', async () => {
    let failing = true;
    class FlakyDisk extends InMemoryVaultFileSystem {
      override async writeFile(path: string, contents: string): Promise<void> {
        if (failing) throw new Error('disk full');
        await super.writeFile(path, contents);
      }
    }
    const initial = JSON.stringify({ foldState: { [derived('a.md')]: [1] }, space: { version: 1, id: 'space-1' } });
    const fileSystem = new FlakyDisk({ [STATE_PATH]: initial });

    expect(await migrateRenamedRootState(fileSystem, OLD, NEW)).toBe(false);
    expect(await fileSystem.readFile(STATE_PATH)).toBe(initial);

    failing = false;
    expect(await migrateRenamedRootState(fileSystem, OLD, NEW)).toBe(true);
    expect((await read(fileSystem)).foldState).toEqual({ [moved('a.md')]: [1] });
    expect((await read(fileSystem)).space.id).toBe('space-1');
  });

  it('finishes a state that is half-migrated, without touching what has already moved', async () => {
    const fileSystem = seed({
      foldState: { [moved('done.md')]: [1], [derived('todo.md')]: [2] },
      preferredTemplates: [moved('done-template.md'), derived('todo-template.md')],
    });

    await migrateRenamedRootState(fileSystem, OLD, NEW);

    expect(await read(fileSystem)).toEqual({
      foldState: { [moved('done.md')]: [1], [moved('todo.md')]: [2] },
      preferredTemplates: [moved('done-template.md'), moved('todo-template.md')],
    });
  });

  it('two entries that become the same id keep one, with the later one winning, rather than corrupting the file', () => {
    const result = patch({ foldState: { [derived('a.md')]: [1], [moved('a.md')]: [9] } });

    expect(result.foldState).toEqual({ [moved('a.md')]: [9] });
  });
});

