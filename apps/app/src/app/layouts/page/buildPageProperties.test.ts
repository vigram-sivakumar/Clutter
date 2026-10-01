import { describe, expect, it } from 'vitest';
import type { Page } from '@core/vault/models/Page';
import { buildPageProperties } from './buildPageProperties';

function makePage(type: 'note' | 'daily-note', overrides: Partial<Page['metadata']> = {}): Page {
  return {
    id: 'p1',
    type,
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
      coverPositionAbove: 50,
      coverPositionSide: 50,
      description: 'd',
      favorite: true,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: 'not-a-date',
      tags: ['a', 'b'],
      ...overrides,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [{ value: 'Alt' }],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  } as unknown as Page;
}

describe('buildPageProperties', () => {
  it('exposes exactly Tags, Aliases, Created, Modified, in order', () => {
    const items = buildPageProperties(makePage('note'));
    expect(items.map((i) => i.name)).toEqual(['Tags', 'Aliases', 'Created', 'Modified']);
    expect(items[0]).toEqual({ name: 'Tags', type: 'tag', value: ['a', 'b'] });
    expect(items[1]).toEqual({ name: 'Aliases', type: 'multi-select', value: ['Alt'] });
  });

  it('uses the same properties for Notes and Daily Notes', () => {
    expect(buildPageProperties(makePage('daily-note'))).toEqual(
      buildPageProperties(makePage('note'))
    );
  });

  it('assigns semantic types and carries raw date values', () => {
    const items = buildPageProperties(makePage('note', { createdAt: null }));
    expect(items.map((i) => i.type)).toEqual(['tag', 'multi-select', 'date', 'date']);
    expect(items[2]!.value).toBeNull();
    expect(items[3]!.value).toBe('not-a-date');
    expect(buildPageProperties(makePage('note'))[2]!.value).toBe('2026-01-02T03:04:05.000Z');
  });

  it('treats a missing tags array as empty', () => {
    expect(buildPageProperties(makePage('note', { tags: undefined }))[0]!.value).toEqual([]);
  });
});
