import { describe, expect, it } from 'vitest';

import {
  removeTagFromList,
  removeTagFromMarkdown,
  renameTagInList,
  renameTagInMarkdown,
  restyleTagList,
  restyleTagsInMarkdown,
} from './tagEdits';
import { applyTagStyle } from '../../models/Tag';

const is = (target: string) => (name: string) => name.toLowerCase() === target;

describe('renameTagInMarkdown', () => {
  it('rewrites inline tags, preserving everything around them', () => {
    const result = renameTagInMarkdown('Working on #design today, #design again.', is('design'), 'product-design');

    expect(result).toEqual({
      markdown: 'Working on #product-design today, #product-design again.',
      count: 2,
    });
  });

  it('matches by the predicate (case/separator variants), not by text', () => {
    const match = (name: string) => name.toLowerCase().replace(/[-_]/g, ' ') === 'product design';

    expect(renameTagInMarkdown('#Product-Design #product_design #product', match, 'x').markdown).toBe(
      '#x #x #product'
    );
  });

  it('does not touch inline code, fenced code, or text that only contains #design', () => {
    const markdown = [
      '`#design` and #design',
      '```text',
      '#design',
      '```',
      'foo#design https://x.com/#design \\#design',
      '#designer #design-system',
    ].join('\n');

    expect(renameTagInMarkdown(markdown, is('design'), 'x').markdown).toBe(
      [
        '`#design` and #x',
        '```text',
        '#design',
        '```',
        'foo#design https://x.com/#design \\#design',
        '#designer #design-system',
      ].join('\n')
    );
  });

  it('never rewrites a heading', () => {
    expect(renameTagInMarkdown('# design\n#design', is('design'), 'x').markdown).toBe('# design\n#x');
  });

  it('handles Unicode names whole', () => {
    expect(renameTagInMarkdown('#café and #cafés', is('café'), 'coffee').markdown).toBe('#coffee and #cafés');
  });

  it('reports zero and leaves the document byte-identical when nothing matches', () => {
    const markdown = 'nothing here `#design`';

    expect(renameTagInMarkdown(markdown, is('design'), 'x')).toEqual({ markdown, count: 0 });
  });

  it('is idempotent: running it again changes nothing', () => {
    const once = renameTagInMarkdown('#design', is('design'), 'product-design').markdown;

    expect(renameTagInMarkdown(once, is('design'), 'product-design').count).toBe(0);
  });
});

describe('removeTagFromMarkdown', () => {
  it('closes up the surrounding space', () => {
    expect(removeTagFromMarkdown('a #t b', is('t')).markdown).toBe('a b');
    expect(removeTagFromMarkdown('#t b', is('t')).markdown).toBe('b');
    expect(removeTagFromMarkdown('a #t', is('t')).markdown).toBe('a');
    expect(removeTagFromMarkdown('a #t, b', is('t')).markdown).toBe('a, b');
  });

  it('removes every occurrence but only real ones', () => {
    const result = removeTagFromMarkdown('#t one `#t` two #t\n```\n#t\n```', is('t'));

    expect(result.count).toBe(2);
    expect(result.markdown).toBe('one `#t` two\n```\n#t\n```');
  });

  it('leaves other tags alone', () => {
    expect(removeTagFromMarkdown('#a #b #c', is('b')).markdown).toBe('#a #c');
  });

  it('a line holding only the tag is left empty, not deleted', () => {
    expect(removeTagFromMarkdown('before\n#t\nafter', is('t')).markdown).toBe('before\n\nafter');
  });
});

describe('frontmatter list edits', () => {
  const match = (name: string) => name.toLowerCase() === 'design';

  it('renames matching entries in place, keeping order', () => {
    expect(renameTagInList(['design', 'research'], match, 'product-design')).toEqual(['product-design', 'research']);
  });

  it('renames spelling variants', () => {
    expect(renameTagInList(['Design', 'ux'], match, 'x')).toEqual(['x', 'ux']);
  });

  it('collapses duplicates produced by the rename', () => {
    expect(renameTagInList(['design', 'Design', 'ux'], match, 'x')).toEqual(['x', 'ux']);
  });

  it('returns null when nothing matches (so no write is needed)', () => {
    expect(renameTagInList(['research'], match, 'x')).toBeNull();
    expect(renameTagInList([], match, 'x')).toBeNull();
    expect(removeTagFromList(['research'], match)).toBeNull();
  });

  it('removes matching entries', () => {
    expect(removeTagFromList(['design', 'research', 'Design'], match)).toEqual(['research']);
    expect(removeTagFromList(['design'], match)).toEqual([]);
  });
});

describe('restyleTagsInMarkdown', () => {
  const title = (name: string) => applyTagStyle(name, 'title');

  it('re-cases inline tags and leaves the rest of the text byte-identical', () => {
    expect(restyleTagsInMarkdown('Work on #design-system and #ux, then #design-system.', title)).toEqual({
      markdown: 'Work on #Design-System and #Ux, then #Design-System.',
      count: 3,
    });
  });

  it('does not touch code, escapes or headings', () => {
    const markdown = '`#design` \\#design\n\n# Heading\n\n```\n#design\n```\n';

    expect(restyleTagsInMarkdown(markdown, title)).toEqual({ markdown, count: 0 });
  });

  it('is idempotent: an already-styled tag is not rewritten', () => {
    const once = restyleTagsInMarkdown('#design-system', title).markdown;

    expect(restyleTagsInMarkdown(once, title)).toEqual({ markdown: once, count: 0 });
  });
});

describe('restyleTagList', () => {
  const title = (name: string) => applyTagStyle(name, 'title');

  it('re-cases every entry', () => {
    expect(restyleTagList(['design-system', 'ux'], title)).toEqual(['Design-System', 'Ux']);
  });

  it('collapses entries that become the same tag', () => {
    expect(restyleTagList(['Foo', 'foo', 'bar'], title)).toEqual(['Foo', 'Bar']);
  });

  it('returns null when nothing changes', () => {
    expect(restyleTagList(['Design-System'], title)).toBeNull();
    expect(restyleTagList([], title)).toBeNull();
  });
});
