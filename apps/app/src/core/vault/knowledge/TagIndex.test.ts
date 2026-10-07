import { describe, expect, it } from 'vitest';

import { TagIndex } from './TagIndex';
import { FrontmatterParser } from '../ingest/FrontmatterParser';
import { PageBuilder } from '../ingest/PageBuilder';
import { normalizeTagName } from '../models/Tag';
import type { Page } from '../models/Page';

const ROOT = '/vault';

/** A page built the way a real scan builds it: parsed from the exact text of its file. */
function page(id: string, body: string, frontmatterTags: readonly string[] = []): Page {
  const frontmatter =
    frontmatterTags.length > 0
      ? `---\nid: ${id}\ntags:\n${frontmatterTags.map((tag) => `  - ${tag}`).join('\n')}\n---\n`
      : `---\nid: ${id}\n---\n`;
  const parsed = new FrontmatterParser().parse(`${frontmatter}${body}`);

  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${id}.md`,
      directoryPath: ROOT,
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: parsed.frontmatterAnalysis,
      content: parsed.body,
      analysis: parsed.analysis,
    },
  });
}

const idsFor = (index: TagIndex, name: string) => index.pageIdsFor(normalizeTagName(name));
const usageOf = (index: TagIndex, name: string) =>
  index.tags().find((tag) => normalizeTagName(tag.name) === normalizeTagName(name))?.usageCount;

describe('TagIndex — a note counts once per tag, never once per occurrence', () => {
  it('several inline occurrences on the same line are one page', () => {
    const index = TagIndex.build([page('a', 'Ship #design, then #design again, and #Design once more.')]);

    expect(idsFor(index, 'design')).toEqual(['a']);
    expect(usageOf(index, 'design')).toBe(1);
  });

  it('inline occurrences across different lines are one page', () => {
    const index = TagIndex.build([page('a', '#design\n\nLater: #design\n\n- item #design\n- another #design')]);

    expect(idsFor(index, 'design')).toEqual(['a']);
    expect(usageOf(index, 'design')).toBe(1);
  });

  it('duplicate frontmatter entries (any casing or separator) are one page', () => {
    const index = TagIndex.build([
      page('a', 'Body', ['design-system', 'design-system', 'Design-System', 'design_system']),
    ]);

    expect(idsFor(index, 'design-system')).toEqual(['a']);
    expect(usageOf(index, 'design-system')).toBe(1);
  });

  it('the same tag inline and in frontmatter is one page', () => {
    const index = TagIndex.build([page('a', 'About #design here.', ['design'])]);

    expect(idsFor(index, 'design')).toEqual(['a']);
    expect(usageOf(index, 'design')).toBe(1);
  });

  it('a note using the tag every way at once is still one page', () => {
    const index = TagIndex.build([
      page('a', '#design #design\n\n#Design on another line', ['design', 'Design', 'design']),
    ]);

    expect(idsFor(index, 'design')).toEqual(['a']);
    expect(usageOf(index, 'design')).toBe(1);
  });

  it('two separate notes using the same tag are two pages, in note order', () => {
    const index = TagIndex.build([
      page('a', '#design #design', ['design']),
      page('b', 'Only frontmatter here.', ['design']),
      page('c', 'Unrelated.'),
    ]);

    expect(idsFor(index, 'design')).toEqual(['a', 'b']);
    expect(usageOf(index, 'design')).toBe(2);
  });

  it('different tags on the same page each count that page once', () => {
    const index = TagIndex.build([page('a', '#design #design #research', ['research', 'design'])]);

    expect(idsFor(index, 'design')).toEqual(['a']);
    expect(idsFor(index, 'research')).toEqual(['a']);
    expect(index.tags().map((tag) => [tag.name, tag.usageCount])).toEqual([
      ['design', 1],
      ['research', 1],
    ]);
  });

  it('re-indexing an unchanged page never double counts', () => {
    const a = page('a', '#design #design', ['design']);
    const index = TagIndex.build([a]);

    index.upsertPage(a);
    index.upsertPage(a);

    expect(idsFor(index, 'design')).toEqual(['a']);
    expect(usageOf(index, 'design')).toBe(1);
  });

  it('a changed page moves in and out of the tag, and a removed page leaves it', () => {
    const index = TagIndex.build([page('a', '#design'), page('b', '#design')]);

    index.upsertPage(page('a', 'No tag now.'));
    expect(idsFor(index, 'design')).toEqual(['b']);

    index.upsertPage(page('a', '#design #design', ['design']));
    expect(idsFor(index, 'design').slice().sort()).toEqual(['a', 'b']);

    index.removePage('b');
    expect(idsFor(index, 'design')).toEqual(['a']);
    expect(usageOf(index, 'design')).toBe(1);
  });

  it('for every tag, the page ids are unique and exactly its usageCount', () => {
    const index = TagIndex.build([
      page('a', '#design #design #research\n#research', ['design', 'design', 'ideas']),
      page('b', '#Design', ['Research', 'research']),
      page('c', 'Nothing.', ['design']),
      page('d', '#ideas #ideas #ideas'),
    ]);

    for (const tag of index.tags()) {
      const ids = idsFor(index, tag.name);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(tag.usageCount);
    }
  });
});
