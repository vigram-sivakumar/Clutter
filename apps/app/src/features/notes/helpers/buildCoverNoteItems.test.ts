import { describe, expect, it } from 'vitest';

import type { Page } from '@core/vault/models/Page';
import { buildCoverNoteItems } from './buildCoverNoteItems';

const page = (id: string, name: string, icon: string | null = null) =>
  ({ id, name, metadata: { icon } }) as unknown as Page;

describe('buildCoverNoteItems', () => {
  it('lists every page as a flat, alphabetical row with its own emoji', () => {
    const items = buildCoverNoteItems([page('b', 'beta', '🚀'), page('a', 'Alpha')]);

    expect(items).toEqual([
      { id: 'a', title: 'Alpha', emoji: null, level: 0, parentId: null },
      { id: 'b', title: 'beta', emoji: '🚀', level: 0, parentId: null },
    ]);
  });
});
