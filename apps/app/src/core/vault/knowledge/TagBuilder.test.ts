import { describe, expect, it } from 'vitest';
import { TagBuilder } from './TagBuilder';
import type { Page } from '../models';

function makePage(name: string, tagNames: readonly string[]): Page {
  return {
    id: `page-${name}`,
    type: 'note',
    name,
    path: `/vault/${name}.md`,
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      description: '',
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: tagNames.map((tagName) => ({ name: tagName, sourcePageId: `page-${name}` })),
      links: [],
      embeds: [],
    },
  };
}

describe('TagBuilder', () => {
  it('produces one Tag per unique occurrence name with no metadata', () => {
    const builder = new TagBuilder();
    const tags = builder.build([makePage('a', ['project', 'design']), makePage('b', ['project'])]);

    expect(tags).toHaveLength(2);
    expect(tags.find((tag) => tag.name === 'project')?.icon).toBeUndefined();
    expect(tags.find((tag) => tag.name === 'design')?.icon).toBeUndefined();
  });

  it('enriches a Tag with metadata matching its occurrence name', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['project'])],
      new Map([['project', { icon: '📦' }]])
    );

    expect(tags).toEqual([{ name: 'project', icon: '📦' }]);
  });

  it('never manufactures a Tag from metadata alone — markdown determines existence', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['project'])],
      new Map([
        ['project', { icon: '📦' }],
        ['orphaned', { icon: '👻' }],
      ])
    );

    expect(tags).toHaveLength(1);
    expect(tags[0]!.name).toBe('project');
  });
});
