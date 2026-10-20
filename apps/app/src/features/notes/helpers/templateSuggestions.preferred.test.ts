import { describe, expect, it } from 'vitest';
import { PreferredTemplatesStore } from '@core/application/templates/PreferredTemplatesStore';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import {
  putPreferredTemplatesFirst,
  sortTemplatesByRecentUse,
} from './templateSuggestions';

const entry = (id: string, created: string): CollectionEntryModel =>
  ({
    id,
    type: 'note',
    icon: 'note',
    emoji: null,
    selected: false,
    onClick: () => {},
    values: { name: id, created },
  }) as unknown as CollectionEntryModel;

const ids = (templates: readonly CollectionEntryModel[]) =>
  templates.map((template) => template.id);

// Newest first, as the existing ranking orders them with no usage: e, d, c, b, a.
const ALL = [
  entry('a', '2020-01-01T00:00:00.000Z'),
  entry('b', '2021-01-01T00:00:00.000Z'),
  entry('c', '2022-01-01T00:00:00.000Z'),
  entry('d', '2023-01-01T00:00:00.000Z'),
  entry('e', '2024-01-01T00:00:00.000Z'),
];
const ranked = (templates: readonly CollectionEntryModel[] = ALL) =>
  sortTemplatesByRecentUse(templates, () => undefined);

describe('putPreferredTemplatesFirst', () => {
  it('puts the preferred templates first, in their configured order — not the ranking order', () => {
    expect(ids(putPreferredTemplatesFirst(ranked(), ['b', 'e']))).toEqual([
      'b',
      'e',
      'd',
      'c',
      'a',
    ]);
    expect(ids(putPreferredTemplatesFirst(ranked(), ['e', 'b']))).toEqual([
      'e',
      'b',
      'd',
      'c',
      'a',
    ]);
  });

  it('follows them with the remaining templates in the existing ranking', () => {
    const lastUsed: Record<string, number> = {
      a: Date.parse('2026-02-01T00:00:00.000Z'),
      c: Date.parse('2026-01-01T00:00:00.000Z'),
    };
    const byUse = sortTemplatesByRecentUse(ALL, (id) => lastUsed[id]);
    expect(ids(byUse).slice(0, 2)).toEqual(['a', 'c']); // the existing ranking, for reference

    expect(ids(putPreferredTemplatesFirst(byUse, ['e']))).toEqual([
      'e',
      ...ids(byUse).filter((id) => id !== 'e'),
    ]);
  });

  it('never lists a template twice, even if a preferred id repeats', () => {
    const result = putPreferredTemplatesFirst(ranked(), ['c', 'c', 'a', 'c']);
    expect(ids(result)).toEqual(['c', 'a', 'e', 'd', 'b']);
    expect(new Set(ids(result)).size).toBe(ALL.length);
  });

  it('is exactly the existing ranking when nothing is preferred, and does not change its input', () => {
    const input = ranked();
    const snapshot = ids(input);
    expect(ids(putPreferredTemplatesFirst(input, []))).toEqual(snapshot);
    putPreferredTemplatesFirst(input, ['a']);
    expect(ids(input)).toEqual(snapshot);
  });

  it('hides a preferred template that is not offered, without disturbing the others', () => {
    // "gone" is archived, deleted or moved out of Templates: it is not among the candidates.
    expect(
      ids(putPreferredTemplatesFirst(ranked(), ['b', 'gone', 'e']))
    ).toEqual(['b', 'e', 'd', 'c', 'a']);
  });
});

describe('preferred templates and their saved preference', () => {
  const ROOT = '/vault';
  const flushWrites = () => new Promise((resolve) => setTimeout(resolve, 0));
  const reload = (fileSystem: InMemoryVaultFileSystem) =>
    PreferredTemplatesStore.load(fileSystem, ROOT);

  it('are respected after restarting the application', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = PreferredTemplatesStore.empty(fileSystem, ROOT);
    store.add('d');
    store.add('a');
    await flushWrites();

    const restarted = await reload(fileSystem);
    expect(
      ids(putPreferredTemplatesFirst(ranked(), restarted.getIds()))
    ).toEqual(['d', 'a', 'e', 'c', 'b']);
  });

  it('are per space: each space orders the same templates by its own list', async () => {
    const spaceOne = new InMemoryVaultFileSystem();
    const spaceTwo = new InMemoryVaultFileSystem();
    const one = PreferredTemplatesStore.empty(spaceOne, ROOT);
    const two = PreferredTemplatesStore.empty(spaceTwo, ROOT);
    one.add('a');
    two.add('e');
    two.add('b');
    await flushWrites();

    const restartedOne = await reload(spaceOne);
    const restartedTwo = await reload(spaceTwo);
    expect(
      ids(putPreferredTemplatesFirst(ranked(), restartedOne.getIds())).slice(
        0,
        2
      )
    ).toEqual(['a', 'e']);
    expect(
      ids(putPreferredTemplatesFirst(ranked(), restartedTwo.getIds())).slice(
        0,
        2
      )
    ).toEqual(['e', 'b']);
    // Changing one space never touches the other.
    one.add('c');
    await flushWrites();
    expect((await reload(spaceTwo)).getIds()).toEqual(['e', 'b']);
  });

  it('keep the saved preference while a template is unavailable, and its original place when it is back', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const store = PreferredTemplatesStore.empty(fileSystem, ROOT);
    ['c', 'a', 'd'].forEach((id) => store.add(id));
    await flushWrites();

    // "a" is archived (or moved out of Templates): not offered, so hidden…
    const withoutA = ranked(ALL.filter((template) => template.id !== 'a'));
    expect(ids(putPreferredTemplatesFirst(withoutA, store.getIds()))).toEqual([
      'c',
      'd',
      'e',
      'b',
    ]);
    // …but its preference was never touched.
    expect((await reload(fileSystem)).getIds()).toEqual(['c', 'a', 'd']);

    // Restored (or moved back): offered again, and takes its original preferred position.
    expect(ids(putPreferredTemplatesFirst(ranked(), store.getIds()))).toEqual([
      'c',
      'a',
      'd',
      'e',
      'b',
    ]);
  });
});
