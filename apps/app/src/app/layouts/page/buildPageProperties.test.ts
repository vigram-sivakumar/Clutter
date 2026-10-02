import { describe, expect, it, vi } from 'vitest';
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
      aliases: ['Alt'],
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
    expect(items[0]).toEqual({
      name: 'Tags',
      type: 'tag',
      value: ['a', 'b'],
      onOpenTag: undefined,
      editable: false,
    });
    expect(items[1]).toEqual({
      name: 'Aliases',
      type: 'multi-select',
      value: ['Alt'],
      editable: false,
    });
  });

  it('reads Aliases from frontmatter metadata, not the derived analysis', () => {
    const page = makePage('note', { aliases: ['From frontmatter'] });
    expect(buildPageProperties(page)[1]!.value).toEqual(['From frontmatter']);
  });

  it('makes Aliases editable with the host actions, wiring commit and suggestions', () => {
    const onCommit = vi.fn();
    const getSuggestions = vi.fn(() => []);
    const aliases = buildPageProperties(makePage('note'), { aliases: { onCommit, getSuggestions } })[1]!;

    expect(aliases).toMatchObject({ name: 'Aliases', type: 'multi-select', value: ['Alt'], editable: true });
    if (aliases.type !== 'multi-select' || !aliases.editable) throw new Error('expected editable');
    aliases.onCommit(['Alt', 'New']);
    expect(onCommit).toHaveBeenCalledWith(['Alt', 'New']);
    expect(aliases.getSuggestions).toBe(getSuggestions);
  });

  it('keeps Aliases read-only on an archived page even with host actions', () => {
    const page = makePage('note', { status: 'archived' });
    const aliases = buildPageProperties(page, { aliases: { onCommit: vi.fn() } })[1]!;
    expect(aliases.editable).toBe(false);
  });

  it('uses the same properties for Notes and Daily Notes', () => {
    expect(buildPageProperties(makePage('daily-note'))).toEqual(
      buildPageProperties(makePage('note'))
    );
  });

  it('exposes Created/Modified as read-only date Properties carrying the raw timestamp', () => {
    const items = buildPageProperties(makePage('note', { createdAt: null }));
    expect(items[2]).toEqual({ name: 'Created', type: 'date', value: null, editable: false });
    expect(items[3]).toEqual({
      name: 'Modified',
      type: 'date',
      value: 'not-a-date',
      editable: false,
    });
    expect(buildPageProperties(makePage('note'))[2]!.value).toBe('2026-01-02T03:04:05.000Z');
  });

  it('wires onOpenTag onto the Tags Property', () => {
    const onOpenTag = (): void => {};
    const items = buildPageProperties(makePage('note'), { onOpenTag });
    expect(items[0]).toMatchObject({ name: 'Tags', onOpenTag });
  });

  it('treats a missing tags array as empty', () => {
    expect(buildPageProperties(makePage('note', { tags: undefined }))[0]!.value).toEqual([]);
  });
});
