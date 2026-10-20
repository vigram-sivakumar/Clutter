import { describe, expect, it, vi } from 'vitest';

import { PreferredTemplatesStore } from './PreferredTemplatesStore';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';

const ROOT = '/vault';
const WORKSPACE_PATH = `${ROOT}/.clutter/workspace.json`;

/** Simulates an app restart: reads whatever was persisted back into a fresh store. */
const reload = (fileSystem: InMemoryVaultFileSystem) =>
  PreferredTemplatesStore.load(fileSystem, ROOT);
const flushWrites = () => new Promise((resolve) => setTimeout(resolve, 0));
const persisted = async (fileSystem: InMemoryVaultFileSystem) =>
  JSON.parse(await fileSystem.readFile(WORKSPACE_PATH));
const withFile = (contents: unknown) =>
  new InMemoryVaultFileSystem({
    [WORKSPACE_PATH]:
      typeof contents === 'string' ? contents : JSON.stringify(contents),
  });

describe('PreferredTemplatesStore — load()', () => {
  it('starts empty with no workspace.json, or no "preferredTemplates" key', async () => {
    expect((await reload(new InMemoryVaultFileSystem())).getIds()).toEqual([]);
    expect((await reload(withFile({ foldState: {} }))).getIds()).toEqual([]);
  });

  it('reads the persisted ids in order', async () => {
    const store = await reload(
      withFile({ preferredTemplates: ['b', 'a', 'c'] })
    );
    expect(store.getIds()).toEqual(['b', 'a', 'c']);
  });

  it('discards invalid JSON, a non-object file and a non-array value, without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await reload(withFile('{ not json'))).getIds()).toEqual([]);
    expect((await reload(withFile('[]'))).getIds()).toEqual([]);
    expect(
      (await reload(withFile({ preferredTemplates: { a: 1 } }))).getIds()
    ).toEqual([]);
    warn.mockRestore();
  });

  it('drops non-string, empty and duplicate entries but keeps the rest in order', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await reload(
      withFile({ preferredTemplates: ['a', 3, '', 'b', 'a', null, 'c'] })
    );
    expect(store.getIds()).toEqual(['a', 'b', 'c']);
    warn.mockRestore();
  });
});

describe('PreferredTemplatesStore — add() / remove()', () => {
  it('appends in selection order and persists', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);

    store.add('weekly');
    store.add('meeting');
    await flushWrites();

    expect(store.getIds()).toEqual(['weekly', 'meeting']);
    expect((await persisted(fileSystem)).preferredTemplates).toEqual([
      'weekly',
      'meeting',
    ]);
  });

  it('never duplicates a template that is already selected, and does not rewrite or notify for it', async () => {
    const fileSystem = withFile({ preferredTemplates: ['a', 'b'] });
    const store = await reload(fileSystem);
    const listener = vi.fn();
    store.subscribe(listener);
    const writeFile = vi.spyOn(fileSystem, 'writeFile');

    store.add('a');
    await flushWrites();

    expect(store.getIds()).toEqual(['a', 'b']);
    expect(listener).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('removes only that id, keeps the order of the rest, and persists', async () => {
    const fileSystem = withFile({ preferredTemplates: ['a', 'b', 'c'] });
    const store = await reload(fileSystem);

    store.remove('b');
    await flushWrites();

    expect(store.getIds()).toEqual(['a', 'c']);
    expect((await persisted(fileSystem)).preferredTemplates).toEqual([
      'a',
      'c',
    ]);
  });

  it('removing an id that is not selected changes nothing', async () => {
    const store = await reload(withFile({ preferredTemplates: ['a'] }));
    const listener = vi.fn();
    store.subscribe(listener);
    store.remove('zzz');
    expect(store.getIds()).toEqual(['a']);
    expect(listener).not.toHaveBeenCalled();
  });

  it('a removed template can be added again, at the end', async () => {
    const store = await reload(withFile({ preferredTemplates: ['a', 'b'] }));
    store.remove('a');
    store.add('a');
    expect(store.getIds()).toEqual(['b', 'a']);
  });

  it('survives a restart, order included, and keeps sibling keys', async () => {
    const fileSystem = withFile({
      templateUsage: { a: { lastUsedAt: 1 } },
      preferredTemplates: ['x'],
    });
    const store = await reload(fileSystem);
    store.add('y');
    store.add('z');
    store.remove('x');
    await flushWrites();

    const restarted = await reload(fileSystem);
    expect(restarted.getIds()).toEqual(['y', 'z']);
    expect((await persisted(fileSystem)).templateUsage).toEqual({
      a: { lastUsedAt: 1 },
    });
  });

  it('keeps an id whose template no longer exists: it is inert, not removed', async () => {
    const store = await reload(
      withFile({ preferredTemplates: ['deleted-template', 'live'] })
    );
    store.add('another');
    expect(store.getIds()).toEqual(['deleted-template', 'live', 'another']);
  });
});

describe('PreferredTemplatesStore — removeAll()', () => {
  it('removes every listed id in one change, keeping the rest in order, and persists', async () => {
    const fileSystem = withFile({
      preferredTemplates: ['a', 'b', 'c', 'd', 'e'],
    });
    const store = await reload(fileSystem);
    const listener = vi.fn();
    store.subscribe(listener);

    store.removeAll(['d', 'b', 'zzz']);
    await flushWrites();

    expect(store.getIds()).toEqual(['a', 'c', 'e']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((await persisted(fileSystem)).preferredTemplates).toEqual([
      'a',
      'c',
      'e',
    ]);
  });

  it('does nothing, and writes nothing, when none of the ids is preferred', async () => {
    const fileSystem = withFile({ preferredTemplates: ['a', 'b'] });
    const store = await reload(fileSystem);
    const listener = vi.fn();
    store.subscribe(listener);
    const writeFile = vi.spyOn(fileSystem, 'writeFile');
    const before = store.getIds();

    store.removeAll(['x', 'y']);
    store.removeAll([]);
    await flushWrites();

    expect(store.getIds()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('PreferredTemplatesStore — subscribe()', () => {
  it('notifies on a change with a new array, stays stable otherwise, and stops after unsubscribe', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getIds();

    store.add('a');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getIds()).not.toBe(before);
    expect(store.getIds()).toBe(store.getIds());

    unsubscribe();
    store.add('b');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('PreferredTemplatesStore — Notes and Daily notes contexts', () => {
  it('keeps independent lists: changing one context never changes the other', async () => {
    const store = await reload(new InMemoryVaultFileSystem());

    store.add('daily-a', 'dailyNotes');
    store.add('note-a', 'notes');
    store.add('note-b', 'notes');
    store.remove('daily-a', 'notes');

    expect(store.getIds('dailyNotes')).toEqual(['daily-a']);
    expect(store.getIds('notes')).toEqual(['note-a', 'note-b']);

    store.remove('note-a', 'notes');
    expect(store.getIds('dailyNotes')).toEqual(['daily-a']);
    expect(store.getIds('notes')).toEqual(['note-b']);
  });

  it('defaults to Daily notes, the context the store was first written for', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    store.add('x');
    expect(store.getIds()).toEqual(['x']);
    expect(store.getIds('dailyNotes')).toEqual(['x']);
    expect(store.getIds('notes')).toEqual([]);
  });

  it('persists each list under its own key and restores both after a restart', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    store.add('daily-a', 'dailyNotes');
    store.add('note-b', 'notes');
    store.add('note-a', 'notes');
    await flushWrites();

    const file = await persisted(fileSystem);
    expect(file.preferredTemplates).toEqual(['daily-a']);
    expect(file.preferredNoteTemplates).toEqual(['note-b', 'note-a']);

    const restarted = await reload(fileSystem);
    expect(restarted.getIds('dailyNotes')).toEqual(['daily-a']);
    expect(restarted.getIds('notes')).toEqual(['note-b', 'note-a']);
  });

  it('reads a file written before Notes had preferences unchanged, with an empty Notes list', async () => {
    const fileSystem = withFile({ preferredTemplates: ['b', 'a'] });
    const store = await reload(fileSystem);
    expect(store.getIds('dailyNotes')).toEqual(['b', 'a']);
    expect(store.getIds('notes')).toEqual([]);

    store.add('n', 'notes');
    await flushWrites();
    expect((await persisted(fileSystem)).preferredTemplates).toEqual(['b', 'a']);
  });

  it('discards a malformed Notes list without touching the Daily notes list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await reload(
      withFile({ preferredTemplates: ['a'], preferredNoteTemplates: 'oops' })
    );
    expect(store.getIds('dailyNotes')).toEqual(['a']);
    expect(store.getIds('notes')).toEqual([]);
    warn.mockRestore();
  });

  it('notifies subscribers for a change in either context, and keeps the other list\'s array identity', async () => {
    const store = await reload(new InMemoryVaultFileSystem());
    const listener = vi.fn();
    store.subscribe(listener);
    const dailyBefore = store.getIds('dailyNotes');

    store.add('n', 'notes');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getIds('dailyNotes')).toBe(dailyBefore);
  });

  it('is scoped to its Space: another Space\'s file has its own lists', async () => {
    const a = await PreferredTemplatesStore.load(withFile({ preferredNoteTemplates: ['x'] }), ROOT);
    const b = await PreferredTemplatesStore.load(new InMemoryVaultFileSystem(), ROOT);
    expect(a.getIds('notes')).toEqual(['x']);
    expect(b.getIds('notes')).toEqual([]);
  });

  it('removeAll drops a deleted template from every context, in one notification', async () => {
    const store = await reload(
      withFile({ preferredTemplates: ['a', 'b'], preferredNoteTemplates: ['b', 'c'] })
    );
    const listener = vi.fn();
    store.subscribe(listener);

    store.removeAll(['b']);

    expect(store.getIds('dailyNotes')).toEqual(['a']);
    expect(store.getIds('notes')).toEqual(['c']);
    expect(listener).toHaveBeenCalledTimes(1);

    store.removeAll(['nope']);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('PreferredTemplatesStore — the default Daily Note template', () => {
  it('is None for a Space that never chose one, including a file from before it existed', async () => {
    expect((await reload(new InMemoryVaultFileSystem())).getDefaultDailyNoteTemplateId()).toBeUndefined();
    expect(
      (await reload(withFile({ preferredTemplates: ['a'] }))).getDefaultDailyNoteTemplateId()
    ).toBeUndefined();
  });

  it('chooses, changes and clears the default, notifying each time, and persists it under its own key', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = await reload(fileSystem);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setDefaultDailyNoteTemplate('weekly');
    await flushWrites();
    expect((await persisted(fileSystem)).defaultDailyNoteTemplate).toBe('weekly');
    expect((await reload(fileSystem)).getDefaultDailyNoteTemplateId()).toBe('weekly');

    store.setDefaultDailyNoteTemplate('journal');
    expect(store.getDefaultDailyNoteTemplateId()).toBe('journal');

    store.setDefaultDailyNoteTemplate(undefined);
    await flushWrites();
    expect(store.getDefaultDailyNoteTemplateId()).toBeUndefined();
    expect((await persisted(fileSystem)).defaultDailyNoteTemplate).toBeUndefined();
    expect((await reload(fileSystem)).getDefaultDailyNoteTemplateId()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does nothing, and writes nothing, when the choice does not change', async () => {
    const fileSystem = withFile({ defaultDailyNoteTemplate: 'weekly' });
    const store = await reload(fileSystem);
    const listener = vi.fn();
    store.subscribe(listener);
    const writeFile = vi.spyOn(fileSystem, 'writeFile');

    store.setDefaultDailyNoteTemplate('weekly');
    await flushWrites();

    expect(listener).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('is separate from the preferred lists: neither changes the other, and the default is never in a list', async () => {
    const store = await reload(withFile({ preferredTemplates: ['a', 'b'], preferredNoteTemplates: ['c'] }));

    store.setDefaultDailyNoteTemplate('a');
    expect(store.getIds('dailyNotes')).toEqual(['a', 'b']);
    expect(store.getIds('notes')).toEqual(['c']);

    store.remove('a', 'dailyNotes');
    expect(store.getDefaultDailyNoteTemplateId()).toBe('a');

    store.setDefaultDailyNoteTemplate(undefined);
    expect(store.getIds('dailyNotes')).toEqual(['b']);
  });

  it('keeps its sibling keys, and ignores a malformed saved value', async () => {
    const fileSystem = withFile({ templateUsage: { a: { lastUsedAt: 1 } }, defaultDailyNoteTemplate: 7 });
    const store = await reload(fileSystem);
    expect(store.getDefaultDailyNoteTemplateId()).toBeUndefined();

    store.setDefaultDailyNoteTemplate('weekly');
    await flushWrites();
    expect((await persisted(fileSystem)).templateUsage).toEqual({ a: { lastUsedAt: 1 } });
  });

  it('is dropped when its template is permanently deleted (removeAll), and only then', async () => {
    const store = await reload(withFile({ preferredTemplates: ['a'], defaultDailyNoteTemplate: 'weekly' }));

    store.removeAll(['unrelated']);
    expect(store.getDefaultDailyNoteTemplateId()).toBe('weekly');

    store.removeAll(['weekly']);
    expect(store.getDefaultDailyNoteTemplateId()).toBeUndefined();
    expect(store.getIds('dailyNotes')).toEqual(['a']);
  });

  it('is independent per Space: each Space file has its own', async () => {
    const a = withFile({ defaultDailyNoteTemplate: 'x' });
    const b = new InMemoryVaultFileSystem();
    expect((await reload(a)).getDefaultDailyNoteTemplateId()).toBe('x');
    expect((await reload(b)).getDefaultDailyNoteTemplateId()).toBeUndefined();
  });
});
