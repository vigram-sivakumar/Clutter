import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '../FrontmatterParser';
import { FrontmatterSerializer } from '../FrontmatterSerializer';
import { PageBuilder } from '../PageBuilder';
import {
  addCustomProperty,
  readCustomProperties,
  removeCustomListItem,
  removeCustomProperty,
  renameCustomProperty,
  setCustomListValue,
  setCustomScalarValue,
  splitKeyBlocks,
  validateCustomPropertyName,
} from './customFrontmatter';
import { quoteFrontmatterKey, readKeyLine } from './frontmatterStringValue';
import {
  addCustomPropertyLines,
  addSystemPropertyLines,
  deleteCustomPropertyLines,
  readPropertySequence,
  renameCustomPropertyLines,
  reorderPropertiesLines,
} from './propertyLines';
import { documentOf, frontmatterLines, readDocument, writeDocument } from './propertyDocumentTestSupport';

/**
 * Custom property names that contain a colon (or quotes, or lead with a YAML indicator) are written as
 * quoted keys — `"Project: Name": Clutter` — and read back as the name they denote. Quoting is only a
 * spelling: the name is the same in the model, the UI, the edits and `properties.order`.
 */

const parse = (yaml: string) => new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`);
const customLines = (yaml: string): readonly string[] => parse(yaml).frontmatter.unownedLines ?? [];
const keys = (lines: readonly string[]) => readCustomProperties(lines).map((property) => property.key);

describe('readKeyLine / quoteFrontmatterKey', () => {
  it.each([
    ['plain: value', 'plain', 5],
    ['Due date: 2026-10-01', 'Due date', 8],
    ['"Project: Name": Clutter', 'Project: Name', 15],
    ["'Project: Name': Clutter", 'Project: Name', 15],
    ['"Project: Name" : Clutter', 'Project: Name', 16],
    ['"say \\"hi\\"": x', 'say "hi"', 12],
    ["'it''s': x", "it's", 7],
    ['"a:b": x', 'a:b', 5],
    ['"# note": x', '# note', 8],
    ['"- item": x', '- item', 8],
  ])('%s → key %j', (line, key, separator) => {
    expect(readKeyLine(line)).toEqual({ key, separator });
  });

  it('a line with no separator has no key; a quote that is not a key stays a plain key', () => {
    expect(readKeyLine('no separator')).toBeNull();
    expect(readKeyLine('"unterminated: x')).toEqual({ key: '"unterminated', separator: 13 });
    expect(readKeyLine('"quoted" trailing: x')?.key).toBe('"quoted" trailing');
  });

  it('quotes a key only where a plain key could not carry it — ordinary names are written as they always were', () => {
    for (const plain of ['priority', 'Due date', 'true', '2026', "Bob's", 'a#b', 'estimate (h)']) {
      expect(quoteFrontmatterKey(plain), plain).toBe(plain);
    }
    expect(quoteFrontmatterKey('Project: Name')).toBe('"Project: Name"');
    expect(quoteFrontmatterKey('a:b')).toBe('"a:b"');
    expect(quoteFrontmatterKey('# note')).toBe('"# note"');
    expect(quoteFrontmatterKey('- item')).toBe('"- item"');
    expect(quoteFrontmatterKey('"quoted"')).toBe('"\\"quoted\\""');
    expect(quoteFrontmatterKey("'single'")).toBe(`"'single'"`);
    expect(quoteFrontmatterKey('back\\slash: x')).toBe('"back\\\\slash: x"');
    expect(quoteFrontmatterKey('note #1')).toBe('"note #1"');
  });

  it.each(['Project: Name', 'a:b', '# note', '- item', '"quoted"', "'single'", 'back\\slash: x', 'a "b": c', 'trailing:', ': leading', 'note #1', 'x'])(
    'the name %j reads back exactly as written',
    (name) => {
      expect(readKeyLine(`${quoteFrontmatterKey(name)}: value`)?.key).toBe(name);
    }
  );
});

describe('a quoted key in the frontmatter', () => {
  it('is parsed as the property it names: `"Project: Name": Clutter`', () => {
    const lines = customLines('"Project: Name": Clutter\npriority: high');

    expect(lines).toEqual(['"Project: Name": Clutter', 'priority: high']);
    expect(readCustomProperties(lines)).toEqual([
      { key: 'Project: Name', type: 'text', value: 'Clutter' },
      { key: 'priority', type: 'text', value: 'high' },
    ]);
    expect(splitKeyBlocks(lines).map((block) => block.key)).toEqual(['Project: Name', 'priority']);
  });

  it('keeps its list value and a single-quoted spelling', () => {
    expect(readCustomProperties(customLines('"People: Core":\n  - Ana\n  - Bo'))).toEqual([
      { key: 'People: Core', type: 'list', value: ['Ana', 'Bo'] },
    ]);
    expect(keys(customLines("'Project: Name': x"))).toEqual(['Project: Name']);
  });

  it('is not mistaken for a system key by its colon, and a quoted system key is still that system key', () => {
    const parsed = parse('"tags: more": x\n"tags":\n  - a');

    expect(parsed.frontmatter.tags).toEqual(['a']);
    expect(parsed.frontmatter.unownedLines).toEqual(['"tags: more": x']);
  });

  it('does not change how ordinary lines are read: a colon inside a value or URL, comments, nested mappings', () => {
    const lines = customLines('link: https://example.com:8080/a\ntime: 10:30\nmeta:\n  owner: Ana\nnote: a: b');

    expect(keys(lines)).toEqual(['link', 'time', 'meta', 'note']);
    expect(readCustomProperties(lines).find((p) => p.key === 'link')).toMatchObject({ type: 'url' });
    expect(readCustomProperties(lines).find((p) => p.key === 'note')).toMatchObject({ value: 'a: b' });
  });
});

describe('writing a custom property whose name contains a colon', () => {
  it('adds it as a quoted key, in valid YAML, with the name unchanged', () => {
    const added = addCustomProperty(customLines('author: Jane'), 'Project: Name', { type: 'text', value: 'Clutter' });

    expect(added).toEqual(['author: Jane', '"Project: Name": Clutter']);
    expect(readCustomProperties(added).at(-1)).toEqual({ key: 'Project: Name', type: 'text', value: 'Clutter' });
  });

  it('adds typed and list properties the same way', () => {
    const lines = customLines('x: 1');

    expect(addCustomProperty(lines, 'Due: date', { type: 'date', value: null }).at(-1)).toBe('"Due: date": # date');
    expect(addCustomProperty(lines, 'Who: all', { type: 'multi-select', value: ['Ana'] }).slice(1)).toEqual(['"Who: all":', '  - Ana']);
    expect(addCustomProperty(lines, 'Who: none', { type: 'multi-select', value: [] }).at(-1)).toBe('"Who: none": []');
  });

  it('an ordinary name is written exactly as before', () => {
    expect(addCustomProperty(customLines('x: 1'), 'Due date', { type: 'text', value: 'soon' })).toEqual(['x: 1', 'Due date: soon']);
    expect(addCustomProperty([], 'true', { type: 'text', value: 'x' })).toEqual(['true: x']);
  });

  it('a name that already exists as a quoted key is taken (ignoring case)', () => {
    const lines = customLines('"Project: Name": Clutter');

    expect(validateCustomPropertyName(lines, '', 'project: name')).toBe('taken');
    expect(validateCustomPropertyName(lines, 'Project: Name', 'Project: NAME')).toBeNull();
    expect(validateCustomPropertyName(lines, '', 'Project: Other')).toBeNull();
    expect(validateCustomPropertyName(lines, '', 'a\nb')).toBe('unsupported');
  });
});

describe('editing, renaming and deleting a property whose name contains a colon', () => {
  const start = customLines('author: Jane\n"Project: Name": Clutter  # keep\n"People: Core":\n  - Ana\nz: 1');

  it('sets its value without touching the key spelling or any other line', () => {
    const edited = setCustomScalarValue(start, 'Project: Name', 'text', 'Other');

    expect(edited).toEqual(['author: Jane', '"Project: Name": Other', '"People: Core":', '  - Ana', 'z: 1']);
    expect(readCustomProperties(edited)[1]).toEqual({ key: 'Project: Name', type: 'text', value: 'Other' });
  });

  it('clears a typed value, keeping its quoted key', () => {
    const typed = addCustomProperty([], 'Due: date', { type: 'date', value: '2026-10-01' });

    expect(setCustomScalarValue(typed, 'Due: date', 'date', null)).toEqual(['"Due: date": # date']);
  });

  it('edits and removes the items of a list with such a name', () => {
    expect(setCustomListValue(start, 'People: Core', ['Ana', 'Bo']).slice(2, 5)).toEqual(['"People: Core":', '  - Ana', '  - Bo']);
    expect(setCustomListValue(start, 'People: Core', [])).toContain('"People: Core": []');
    expect(removeCustomListItem(start, 'People: Core', 0, 'Ana')).toContain('"People: Core": []');
  });

  it('renames it to another name with a colon, to a plain name, and from a plain name to one with a colon', () => {
    expect(renameCustomProperty(start, 'Project: Name', 'Project: Title')[1]).toBe('"Project: Title": Clutter  # keep');
    expect(renameCustomProperty(start, 'Project: Name', 'project')[1]).toBe('project: Clutter  # keep');
    expect(renameCustomProperty(customLines('plain: v'), 'plain', 'Plain: v2')).toEqual(['"Plain: v2": v']);
    expect(renameCustomProperty(start, 'Project: Name', ' "Quoted" ')[1]).toBe('"\\"Quoted\\"": Clutter  # keep');
    expect(keys(renameCustomProperty(start, 'Project: Name', 'Project: Title'))).toEqual(['author', 'Project: Title', 'People: Core', 'z']);
  });

  it('deletes it with its own lines only', () => {
    expect(removeCustomProperty(start, 'Project: Name')).toEqual(['author: Jane', '"People: Core":', '  - Ana', 'z: 1']);
    expect(removeCustomProperty(start, 'People: Core')).toEqual(['author: Jane', '"Project: Name": Clutter  # keep', 'z: 1']);
  });
});

describe('ordering a property whose name contains a colon — by its physical entry', () => {
  const ID = 'id: a';
  const TAIL = ['favorite: false', 'status: active'];
  const DOC = documentOf(ID, '"Project: Name": Clutter', 'plain: 1', ...TAIL);
  const sequence = (...frontmatter: string[]) => readPropertySequence(readDocument(documentOf(...frontmatter)).state).map((ref) => ref.key);

  it('is displayed under its actual name, in entry order', () => {
    expect(sequence(ID, '"Project: Name": Clutter', 'plain: 1', ...TAIL)).toEqual(['Project: Name', 'plain']);
    expect(sequence(ID, 'plain: 1', '"Project: Name": Clutter', ...TAIL)).toEqual(['plain', 'Project: Name']);
  });

  it('a reorder moves its quoted entry, spelling intact, and the name is the same afterwards', () => {
    const moved = frontmatterLines(writeDocument(DOC, (state) => reorderPropertiesLines(state, ['plain', 'Project: Name'], 'Project: Name')));

    expect(moved).toEqual([ID, 'plain: 1', '"Project: Name": Clutter', ...TAIL]);
    expect(sequence(...moved)).toEqual(['plain', 'Project: Name']);
  });

  it('a quoted key with a nested value moves whole', () => {
    const doc = documentOf(ID, '"Project: Name":', '  owner: Ana', '  tags:', '    - x', 'plain: 1', ...TAIL);

    expect(frontmatterLines(writeDocument(doc, (state) => reorderPropertiesLines(state, ['plain', 'Project: Name'], 'plain')))).toEqual([
      ID,
      'plain: 1',
      '"Project: Name":',
      '  owner: Ana',
      '  tags:',
      '    - x',
      ...TAIL,
    ]);
  });

  it('renaming keeps its place — to a name with a colon and back', () => {
    const renamed = frontmatterLines(writeDocument(DOC, (state) => renameCustomPropertyLines(state, 'Project: Name', 'Project: Title')));

    expect(renamed).toEqual([ID, '"Project: Title": Clutter', 'plain: 1', ...TAIL]);
    expect(frontmatterLines(writeDocument(documentOf(...renamed), (state) => renameCustomPropertyLines(state, 'Project: Title', 'Plain name')))).toEqual([
      ID,
      'Plain name: Clutter',
      'plain: 1',
      ...TAIL,
    ]);
  });

  it('adding appends it as a quoted entry after the others; deleting removes its entry', () => {
    const added = frontmatterLines(writeDocument(documentOf(ID, 'plain: 1', ...TAIL), (state) => addCustomPropertyLines(state, 'Project: Name', { type: 'text', value: 'Clutter' })));

    expect(added).toEqual([ID, 'plain: 1', ...TAIL, '"Project: Name": Clutter']);

    const deleted = frontmatterLines(writeDocument(documentOf(...added), (state) => deleteCustomPropertyLines(state, 'Project: Name')));
    expect(deleted).toEqual([ID, 'plain: 1', ...TAIL]);
  });

  it('listing a system property leaves the quoted entry where it is', () => {
    const after = frontmatterLines(writeDocument(DOC, (state) => addSystemPropertyLines(state, 'tags')));

    expect(after.slice(0, 3)).toEqual([ID, '"Project: Name": Clutter', 'plain: 1']);
    expect(sequence(...after)).toEqual(['Project: Name', 'plain', 'tags']);
  });

  it('names with quotes, a leading indicator or a backslash round-trip and reorder as whole entries', () => {
    const names = ['say "hi"', '# note', '- item', 'back\\slash: x'];
    let lines: readonly string[] = [];

    for (const name of names) {
      lines = addCustomProperty(lines, name, { type: 'text', value: 'v' });
    }
    const written = [ID, ...lines, ...TAIL];
    const reversed = frontmatterLines(writeDocument(documentOf(...written), (state) => reorderPropertiesLines(state, [...names].reverse(), names[3])));

    expect(sequence(...written)).toEqual(names);
    expect(sequence(...reversed)).toEqual([...names].reverse());
    expect(keys(readDocument(documentOf(...reversed)).state.lines).sort()).toEqual([...names].sort());
  });
});

describe('a property with a colon in its name through a whole page', () => {
  it('survives parse → serialize → parse byte for byte, with unrelated frontmatter untouched', () => {
    const source = [
      '---',
      'id: page-1',
      'created: true',
      'modified: true',
      'favorite: false',
      'status: active',
      'tags:',
      '  - work',
      '"Project: Name": Clutter',
      'link: https://example.com:8080/x',
      'showProperties: false',
      '---',
      'Body',
    ].join('\n');
    const parser = new FrontmatterParser();
    const parsed = parser.parse(source);
    const page = new PageBuilder('/vault').build({
      parentId: null,
      page: {
        path: '/vault/N.md',
        directoryPath: '/vault',
        frontmatter: parsed.frontmatter,
        frontmatterAnalysis: { aliases: [] },
        content: parsed.body,
        analysis: parsed.analysis,
      } as never,
    });

    const written = new FrontmatterSerializer().serializeDocument(page, parsed.body);

    expect(written).toContain('tags:\n  - work\n"Project: Name": Clutter\nlink: https://example.com:8080/x\nshowProperties: false');
    const reparsed = parser.parse(written);
    expect(reparsed.frontmatter.unownedLines).toEqual(parsed.frontmatter.unownedLines);
    expect(readCustomProperties(reparsed.frontmatter.unownedLines ?? []).map((p) => [p.key, p.value])).toEqual([
      ['Project: Name', 'Clutter'],
      ['link', 'https://example.com:8080/x'],
    ]);
    expect(reparsed.frontmatter.tags).toEqual(['work']);
    expect(reparsed.body).toBe('Body');
  });
});
