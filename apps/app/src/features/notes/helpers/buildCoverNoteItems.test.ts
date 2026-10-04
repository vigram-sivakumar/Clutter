import { describe, expect, it } from 'vitest';

import type { Page } from '@core/vault/models/Page';
import { formatDailyNoteTitle } from '@core/presentation/formatDailyNoteTitle';
import { getPageIcon } from '@core/presentation/getPageIcon';
import { buildCoverNoteItems } from './buildCoverNoteItems';

const page = (id: string, name: string, icon: string | null = null, type = 'note') =>
  ({ id, name, type, metadata: { icon } }) as unknown as Page;

import type { Folder } from '@core/vault/models/Folder';

const noFolders = () => undefined;
const folder = (id: string, name: string, parentId: string | null) =>
  ({ id, name, parentId, metadata: { icon: null } }) as unknown as Folder;

describe('buildCoverNoteItems', () => {
  it('lists every page as a flat, alphabetical row with its own emoji and the note icon', () => {
    const items = buildCoverNoteItems([page('b', 'beta', '🚀'), page('a', 'Alpha')], noFolders);

    expect(items).toEqual([
      { id: 'a', title: 'Alpha', emoji: null, icon: 'note', level: 0, parentId: null },
      { id: 'b', title: 'beta', emoji: '🚀', icon: 'note', level: 0, parentId: null },
    ]);
  });

  it('shows a daily note as its date title with the daily note icon', () => {
    const [item] = buildCoverNoteItems([page('d', '2026-08-02', null, 'daily-note')], noFolders);

    expect(item!.title).toBe(formatDailyNoteTitle('2026-08-02'));
    expect(item!.icon).toBe(getPageIcon('daily-note', false));
    expect(item!.emoji).toBeNull();
  });

  it("carries the note's folder chain, root-first, as ancestors", () => {
    const folders = new Map([
      ['projects', folder('projects', 'Projects', null)],
      ['a', folder('a', 'Project A', 'projects')],
    ]);
    const nested = { ...page('n', 'Sprint planning'), parentId: 'a' } as unknown as Page;
    const [item] = buildCoverNoteItems([nested], (id) => folders.get(id));

    expect(item!.ancestors).toEqual([
      { id: 'projects', title: 'Projects', emoji: null },
      { id: 'a', title: 'Project A', emoji: null },
    ]);
  });

  it('gives a daily note no path, even inside a folder', () => {
    const folders = new Map([['daily', folder('daily', 'Daily Notes', null)]]);
    const daily = { ...page('d', '2026-08-02', null, 'daily-note'), parentId: 'daily' } as unknown as Page;
    const [item] = buildCoverNoteItems([daily], (id) => folders.get(id));

    expect(item!.ancestors).toBeUndefined();
  });
});
