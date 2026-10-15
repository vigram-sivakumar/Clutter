import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from './FrontmatterParser';
import { FrontmatterSerializer } from './FrontmatterSerializer';
import { documentOf, frontmatterLines, readDocument } from './frontmatter/propertyDocumentTestSupport';

/**
 * The frontmatter's entries keep their physical order from reading to writing: the parser records it
 * (`entryOrder`), the page carries it (`frontmatterEntryOrder`), and the serializer writes every entry back where
 * the file had it — a system key among custom ones, a configuration block in the middle, a nested mapping whole.
 */

const parse = (...frontmatter: string[]) => new FrontmatterParser().parse(documentOf(...frontmatter)).frontmatter;
/** A document read as a file and written back with no change — what every plain save does to the frontmatter. */
const roundTrip = (...frontmatter: string[]): string[] => {
  const { page, body } = readDocument(documentOf(...frontmatter));

  return frontmatterLines(new FrontmatterSerializer().serializeDocument(page, body));
};

describe('the parser records the physical order of the entries', () => {
  it('system keys by canonical name, other keys as written, each once, in file order', () => {
    expect(
      parse('id: a', 'Priority: High', 'created: 2026-01-01', 'Tags:', '  - x', 'project:', '  name: Clutter', '  settings:', '    a: 1', 'ALIASES: []', 'Name: n').entryOrder
    ).toEqual(['id', 'Priority', 'created', 'tags', 'project', 'aliases', 'Name']);
  });

  it('a quoted key is recorded as the name it denotes; a repeated key once; the configuration block is an entry', () => {
    expect(parse('"Project: Name": x', 'a: 1', 'properties:', '  visible:', '    - tags', 'a: 2').entryOrder).toEqual(['Project: Name', 'a', 'properties']);
  });

  it('is absent for frontmatter with no entries', () => {
    expect(new FrontmatterParser().parse('no frontmatter').frontmatter.entryOrder).toBeUndefined();
  });

  it('is carried by the page read from the file', () => {
    expect(readDocument(documentOf('id: a', 'x: 1', 'created: 2026-01-01')).page.metadata.frontmatterEntryOrder).toEqual(['id', 'x', 'created']);
  });
});

describe('a save writes every entry where the file had it', () => {
  it('a system key stays among the custom ones — nothing is regrouped', () => {
    const entries = ['id: a', 'created: 2026-01-01T00:00:00.000Z', 'Manual: here', 'modified: 2026-01-02T00:00:00.000Z', 'favorite: false', 'icon: 🍄', 'status: active', 'Name: n'];

    expect(roundTrip(...entries)).toEqual(entries);
  });

  it('an entry order that Clutter itself never writes is kept: tags before id, custom entries first', () => {
    const entries = ['Priority: High', 'tags:', '  - x', 'id: a', 'favorite: false', 'status: active', 'created: 2026-01-01T00:00:00.000Z'];

    expect(roundTrip(...entries)).toEqual(entries);
  });

  it('a configuration block in the middle stays in the middle — a plain save relocates nothing', () => {
    const entries = ['id: a', 'created: 2026-01-01T00:00:00.000Z', 'A: 1', 'properties:', '  visible:', '    - created', 'B: 2', 'favorite: false', 'status: active'];

    expect(roundTrip(...entries)).toEqual(entries);
  });

  it('nested mappings, block lists and comments inside an entry stay with it', () => {
    const entries = ['id: a', 'project:', '  name: Clutter', '  # keep', '  settings:', '    priority: high', 'people:', '  - Ana', '  - Bo', 'favorite: false', 'status: active'];

    expect(roundTrip(...entries)).toEqual(entries);
  });

  it('keeps the spelling a file uses for a system key, and quoted custom keys', () => {
    const entries = ['id: a', 'Aliases:', '  - Alt', '"Project: Name": Clutter', 'favorite: false', 'status: active'];

    expect(roundTrip(...entries)).toEqual(entries);
  });

  it('an empty list entry the file has stays (`tags: []`); with no such entry no empty `tags:` is invented', () => {
    expect(roundTrip('id: a', 'tags: []', 'favorite: false', 'status: active')).toEqual(['id: a', 'tags: []', 'favorite: false', 'status: active']);
    expect(roundTrip('id: a', 'favorite: false', 'status: active')).toEqual(['id: a', 'favorite: false', 'status: active']);
  });

  it('an entry the file lacks is appended after the last one — before a trailing configuration block, which stays last', () => {
    expect(roundTrip('id: a', 'A: 1')).toEqual(['id: a', 'A: 1', 'favorite: false', 'status: active']);
    expect(roundTrip('id: a', 'A: 1', 'properties:', '  visible: [tags]')).toEqual(['id: a', 'A: 1', 'favorite: false', 'status: active', 'properties:', '  visible: [tags]']);
  });

  it('a page with no recorded order (a new page) is written in the default order, as before', () => {
    const { page, body } = readDocument(documentOf('id: a', 'created: 2026-01-01T00:00:00.000Z', 'favorite: false', 'status: active', 'x: 1'));
    const fresh = { ...page, metadata: { ...page.metadata, frontmatterEntryOrder: undefined } };

    expect(frontmatterLines(new FrontmatterSerializer().serializeDocument(fresh, body))).toEqual([
      'id: a',
      'created: 2026-01-01T00:00:00.000Z',
      'favorite: false',
      'status: active',
      'x: 1',
    ]);
  });

  it('a retired `type` key is still dropped, and everything else keeps its place', () => {
    expect(roundTrip('id: a', 'type: note', 'A: 1', 'favorite: false', 'status: active')).toEqual(['id: a', 'A: 1', 'favorite: false', 'status: active']);
  });

  it('is stable: a second round trip changes nothing', () => {
    const once = roundTrip('B: 2', 'id: a', 'properties:', '  visible: [created]', 'created: 2026-01-01T00:00:00.000Z', 'A: 1');

    expect(roundTrip(...once)).toEqual(once);
  });
});
