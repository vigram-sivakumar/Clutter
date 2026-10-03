import { describe, expect, it } from 'vitest';

import type { Page } from '@core/vault/models/Page';
import { formatDailyNoteTitle } from '@core/presentation/formatDailyNoteTitle';
import { getPageIcon } from '@core/presentation/getPageIcon';
import { buildCoverNoteItems } from './buildCoverNoteItems';

const page = (id: string, name: string, icon: string | null = null, type = 'note') =>
  ({ id, name, type, metadata: { icon } }) as unknown as Page;

describe('buildCoverNoteItems', () => {
  it('lists every page as a flat, alphabetical row with its own emoji and the note icon', () => {
    const items = buildCoverNoteItems([page('b', 'beta', '🚀'), page('a', 'Alpha')]);

    expect(items).toEqual([
      { id: 'a', title: 'Alpha', emoji: null, icon: 'note', level: 0, parentId: null },
      { id: 'b', title: 'beta', emoji: '🚀', icon: 'note', level: 0, parentId: null },
    ]);
  });

  it('shows a daily note as its date title with the daily note icon', () => {
    const [item] = buildCoverNoteItems([page('d', '2026-08-02', null, 'daily-note')]);

    expect(item!.title).toBe(formatDailyNoteTitle('2026-08-02'));
    expect(item!.icon).toBe(getPageIcon('daily-note', false));
    expect(item!.emoji).toBeNull();
  });
});
