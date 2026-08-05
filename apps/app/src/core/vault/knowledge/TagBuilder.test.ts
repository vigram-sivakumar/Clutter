import { describe, expect, it } from 'vitest';
import { TagBuilder } from './TagBuilder';
import type { Page } from '../models';

function makePage(
  name: string,
  tagNames: readonly string[],
  type: Page['type'] = 'note'
): Page {
  return {
    id: `page-${name}`,
    type,
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

    expect(tags).toEqual([{ name: 'project', icon: '📦', favorite: false, usageCount: 1 }]);
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

  it('sorts tags alphabetically, case-insensitively, regardless of occurrence order', () => {
    const builder = new TagBuilder();
    const tags = builder.build([
      makePage('a', ['travel', 'Architecture', 'design']),
      makePage('b', ['groceries']),
    ]);

    expect(tags.map((tag) => tag.name)).toEqual([
      'Architecture',
      'design',
      'groceries',
      'travel',
    ]);
  });

  it('defaults favorite to false when metadata omits it, including pre-existing files with no favorite field', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['project'])],
      new Map([['project', { icon: '📦' }]])
    );

    expect(tags[0]!.favorite).toBe(false);
  });

  it('resolves favorite: true from metadata onto the Tag', () => {
    const builder = new TagBuilder();
    const tags = builder.build(
      [makePage('a', ['project'])],
      new Map([['project', { favorite: true }]])
    );

    expect(tags[0]!.favorite).toBe(true);
  });

  describe('casing', () => {
    it('preserves a single, consistently-cased tag name exactly as typed', () => {
      const builder = new TagBuilder();
      const tags = builder.build([makePage('a', ['ProJET'])]);

      expect(tags[0]!.name).toBe('ProJET');
    });

    it('merges differently-cased occurrences of the same tag, keeping the first-typed casing', () => {
      const builder = new TagBuilder();
      // #Project (page a, processed first) and #project (page b) are the
      // same tag for dedup/counting purposes — normalizeTagName() decides
      // that — but the stored, displayed name is never rewritten to
      // lowercase; it's exactly what was first encountered.
      const tags = builder.build([
        makePage('a', ['Project']),
        makePage('b', ['project']),
      ]);

      expect(tags).toHaveLength(1);
      expect(tags[0]!.name).toBe('Project');
      expect(tags[0]!.usageCount).toBe(2);
    });

    it('looks up metadata by normalized key even when occurrence casing differs from the tags.json key', () => {
      const builder = new TagBuilder();
      // tags.json keys are already normalized on read (TagOperations/
      // bootstrap) — this confirms the builder's own lookup is normalized
      // too, so #Project still resolves metadata stored under "project".
      const tags = builder.build(
        [makePage('a', ['Project'])],
        new Map([['project', { icon: '📦' }]])
      );

      expect(tags[0]!.name).toBe('Project');
      expect(tags[0]!.icon).toBe('📦');
    });
  });

  describe('usageCount', () => {
    it('counts multiple occurrences within the same page as one', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('a', ['project', 'project', 'project', 'project', 'project']),
      ]);

      expect(tags[0]!.usageCount).toBe(1);
    });

    it('counts each unique page once, regardless of occurrence count within it', () => {
      const builder = new TagBuilder();
      // Note A: 5 mentions, Note B: 1 mention, Daily Note C: 3 mentions —
      // matches the exact scenario from the requirement: displayed count
      // must be 3 (unique pages), not 9 (total occurrences).
      const tags = builder.build([
        makePage('noteA', ['project', 'project', 'project', 'project', 'project']),
        makePage('noteB', ['project']),
        makePage('dailyC', ['project', 'project', 'project'], 'daily-note'),
      ]);

      expect(tags[0]!.usageCount).toBe(3);
    });

    it('counts notes and daily notes equally, with no type-based distinction', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('note', ['project'], 'note'),
        makePage('daily', ['project'], 'daily-note'),
      ]);

      expect(tags[0]!.usageCount).toBe(2);
    });

    it('tracks usageCount independently per tag name', () => {
      const builder = new TagBuilder();
      const tags = builder.build([
        makePage('a', ['project', 'design']),
        makePage('b', ['project']),
      ]);

      expect(tags.find((tag) => tag.name === 'project')?.usageCount).toBe(2);
      expect(tags.find((tag) => tag.name === 'design')?.usageCount).toBe(1);
    });
  });
});
