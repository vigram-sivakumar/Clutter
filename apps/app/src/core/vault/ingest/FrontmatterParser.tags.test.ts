import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from './FrontmatterParser';

const tagsOf = (frontmatterLines: string) =>
  new FrontmatterParser().parse(`---\n${frontmatterLines}\n---\nbody`).frontmatter.tags;

describe('FrontmatterParser — tags', () => {
  it('reads one tag', () => {
    expect(tagsOf('tags:\n  - design')).toEqual(['design']);
  });

  it('reads multiple tags, in order', () => {
    expect(tagsOf('tags:\n  - design\n  - research\n  - ux')).toEqual(['design', 'research', 'ux']);
  });

  it('reads quoted tags without their quotes', () => {
    expect(tagsOf('tags:\n  - "design"\n  - \'research\'')).toEqual(['design', 'research']);
  });

  it('drops a leading # (people write "#design")', () => {
    expect(tagsOf('tags:\n  - "#design"\n  - #research')).toEqual(['design', 'research']);
  });

  it('an empty tags key is an empty list', () => {
    expect(tagsOf('tags:')).toEqual([]);
    expect(tagsOf('tags: []')).toEqual([]);
  });

  it('reads an inline (flow) array', () => {
    expect(tagsOf('tags: [design, "research", \'ux\']')).toEqual(['design', 'research', 'ux']);
  });

  it('reads a single scalar and a comma-separated scalar', () => {
    expect(tagsOf('tags: design')).toEqual(['design']);
    expect(tagsOf('tags: design, research')).toEqual(['design', 'research']);
  });

  it('keeps duplicates as written', () => {
    expect(tagsOf('tags:\n  - design\n  - design')).toEqual(['design', 'design']);
  });

  it('reads Unicode and spaced tags', () => {
    expect(tagsOf('tags:\n  - café\n  - 日本語\n  - design system')).toEqual(['café', '日本語', 'design system']);
  });

  it('is case-insensitive about the key (Tags:) like every system key', () => {
    expect(tagsOf('Tags:\n  - design')).toEqual(['design']);
  });

  it('reads tags alongside unrelated frontmatter without disturbing it', () => {
    const parsed = new FrontmatterParser().parse(
      '---\ntitle: My note\nauthor: Vik\ntags:\n  - design\n  - research\n---\nbody'
    );

    expect(parsed.frontmatter.tags).toEqual(['design', 'research']);
    expect(parsed.frontmatter.unownedLines).toEqual(['title: My note', 'author: Vik']);
  });
});
