import { describe, expect, it } from 'vitest';

import {
  addCustomPropertyLines,
  addSystemPropertyLines,
  deleteAllPropertiesLines,
  deleteCustomPropertyLines,
  readPropertySequence,
  removeSystemPropertyLines,
  renameCustomPropertyLines,
  reorderPropertiesLines,
  setSectionHiddenLines,
} from './propertyLines';
import { documentOf, frontmatterLines, readDocument, writeDocument } from './propertyDocumentTestSupport';

/** The state of a document's frontmatter, as the property operations see it. */
const stateOf = (...frontmatter: string[]) => readDocument(documentOf(...frontmatter)).state;
const written = (document: string, change: Parameters<typeof writeDocument>[1]) => frontmatterLines(writeDocument(document, change));
const keysOf = (...frontmatter: string[]) => readPropertySequence(stateOf(...frontmatter)).map((ref) => ref.key);

const ID = 'id: 04a5ec3b-996d-435c-bcf0-c3e42bdb01f4';
const CREATED = 'created: 2026-08-25T15:42:49.206Z';
const MODIFIED = 'modified: 2026-08-25T15:42:49.206Z';

/** The spec's Example 1: the configuration block in the middle, a custom property after it. */
const EXAMPLE_1 = documentOf(
  ID,
  CREATED,
  'Manual properties: here',
  'Priority: High',
  MODIFIED,
  'favorite: false',
  'icon: 🍄',
  'status: active',
  '',
  'properties:',
  '  visible:',
  '    - created',
  '    - modified',
  '    - aliases',
  '',
  'Name: This is weft'
);

describe('what the Properties list shows — the physical order of the entries', () => {
  it('Example 1: custom properties and listed system properties in file order; the configuration block and other metadata are not rows', () => {
    // aliases is listed but has no entry: it shows after the entries, empty.
    expect(keysOf(...frontmatterLines(EXAMPLE_1))).toEqual(['created', 'Manual properties', 'Priority', 'modified', 'Name', 'aliases']);
  });

  it('`Name` is an ordinary custom property — neither a system property nor the title', () => {
    const { page, state } = readDocument(EXAMPLE_1);

    expect(readPropertySequence(state).find((ref) => ref.key === 'Name')).toEqual({ kind: 'custom', key: 'Name' });
    expect(page.name).not.toBe('This is weft');
  });

  it('a system property shows only when it is listed in `visible` — whatever its entry holds', () => {
    expect(keysOf(ID, 'tags:', '  - a', CREATED, 'Priority: High')).toEqual(['Priority']);
    expect(keysOf(ID, 'tags:', '  - a', CREATED, 'Priority: High', 'properties:', '  visible:', '    - tags')).toEqual(['tags', 'Priority']);
  });

  it('system and custom properties interleave exactly as their entries do', () => {
    expect(
      keysOf(ID, 'Alpha: 1', CREATED, 'Beta: 2', 'tags:', '  - x', 'Gamma: 3', 'properties:', '  visible: [tags, created]')
    ).toEqual(['Alpha', 'created', 'Beta', 'tags', 'Gamma']);
  });

  it('`visible` never orders anything: its own order is irrelevant', () => {
    const doc = ['Alpha: 1', CREATED, 'tags:', '  - x'];

    expect(keysOf(ID, ...doc, 'properties:', '  visible: [created, tags]')).toEqual(keysOf(ID, ...doc, 'properties:', '  visible: [tags, created]'));
  });

  it('the configuration block between property entries is not a row, and `kind: template` never is', () => {
    expect(keysOf(ID, 'A: 1', 'properties:', '  visible: [created]', 'B: 2', 'kind: template', CREATED)).toEqual(['A', 'B', 'created']);
  });

  it('a note with no recorded order (not read from a file) shows its listed system properties, then the custom ones', () => {
    expect(readPropertySequence({ lines: ['b: 1', 'properties:', '  visible: [created]'] }).map((ref) => ref.key)).toEqual(['created', 'b']);
  });

  it('a nested mapping or a block list is one custom property', () => {
    expect(keysOf(ID, 'project:', '  name: Clutter', '  settings:', '    priority: high', 'Owner: Vikram')).toEqual(['project', 'Owner']);
  });
});

describe('Example 2 — a relevant write puts the configuration block last, and nothing else moves', () => {
  it('removing aliases from the list: the entries keep their order, `properties` goes last', () => {
    expect(written(EXAMPLE_1, (state) => removeSystemPropertyLines(state, 'aliases'))).toEqual([
      ID,
      CREATED,
      'Manual properties: here',
      'Priority: High',
      MODIFIED,
      'favorite: false',
      'icon: 🍄',
      'status: active',
      'Name: This is weft',
      'properties:',
      '  visible:',
      '    - created',
      '    - modified',
    ]);
  });

  it('adding a custom property appends it after the entries, before the block, without regrouping system properties', () => {
    expect(written(EXAMPLE_1, (state) => addCustomPropertyLines(state, 'Extra', { type: 'text', value: 'x' }))).toEqual([
      ID,
      CREATED,
      'Manual properties: here',
      'Priority: High',
      MODIFIED,
      'favorite: false',
      'icon: 🍄',
      'status: active',
      'Name: This is weft',
      'Extra: x',
      'properties:',
      '  visible:',
      '    - created',
      '    - modified',
      '    - aliases',
    ]);
  });

  it('a note that is only read is not rewritten: a change that changes nothing returns null', () => {
    expect(removeSystemPropertyLines(stateOf(...frontmatterLines(EXAMPLE_1)), 'tags')).toBeNull();
    expect(addSystemPropertyLines(stateOf(...frontmatterLines(EXAMPLE_1)), 'created')).toBeNull();
    expect(setSectionHiddenLines(stateOf(...frontmatterLines(EXAMPLE_1)), false)).toBeNull();
    expect(reorderPropertiesLines(stateOf(...frontmatterLines(EXAMPLE_1)), keysOf(...frontmatterLines(EXAMPLE_1)))).toBeNull();
  });

  it('hiding and showing the section moves only the block (to the end) — and the entries stay', () => {
    const hidden = written(EXAMPLE_1, (state) => setSectionHiddenLines(state, true));

    expect(hidden.slice(0, 9)).toEqual([ID, CREATED, 'Manual properties: here', 'Priority: High', MODIFIED, 'favorite: false', 'icon: 🍄', 'status: active', 'Name: This is weft']);
    expect(hidden.slice(9)).toEqual(['properties:', '  show: false', '  visible:', '    - created', '    - modified', '    - aliases']);
  });
});

describe('Example 3 — adding a system property', () => {
  const BEFORE = documentOf(
    ID,
    CREATED,
    'Manual properties: here',
    'Priority: High',
    MODIFIED,
    'favorite: false',
    'icon: 🍄',
    'status: active',
    'Name: This is weft',
    '',
    'properties:',
    '  visible:',
    '    - created',
    '    - modified',
    '    - aliases'
  );

  it('with no entry yet: appends the entry (an empty list) after the property entries, then lists it', () => {
    const after = written(BEFORE, (state) => addSystemPropertyLines(state, 'tags'));

    expect(after).toEqual([
      ID,
      CREATED,
      'Manual properties: here',
      'Priority: High',
      MODIFIED,
      'favorite: false',
      'icon: 🍄',
      'status: active',
      'Name: This is weft',
      'tags: []',
      'properties:',
      '  visible:',
      '    - created',
      '    - modified',
      '    - aliases',
      '    - tags',
    ]);
    // Tags shows after Name: its entry follows Name.
    expect(readPropertySequence(readDocument(documentOf(...after)).state).map((ref) => ref.key)).toEqual([
      'created',
      'Manual properties',
      'Priority',
      'modified',
      'Name',
      'tags',
      'aliases',
    ]);
  });

  it('with an entry already there (hidden): never duplicated, never moved — it is only listed', () => {
    const hiddenTags = documentOf(ID, 'tags:', '  - test-tag', CREATED, 'Priority: High', 'favorite: false', 'status: active', 'properties:', '  visible:', '    - created');
    const after = written(hiddenTags, (state) => addSystemPropertyLines(state, 'tags'));

    expect(after).toEqual([ID, 'tags:', '  - test-tag', CREATED, 'Priority: High', 'favorite: false', 'status: active', 'properties:', '  visible:', '    - created', '    - tags']);
    expect(after.filter((line) => line.startsWith('tags'))).toHaveLength(1);
  });

  it('removing and showing again leaves the entry exactly where it was', () => {
    const doc = documentOf(ID, 'A: 1', 'tags:', '  - x', 'B: 2', CREATED, 'favorite: false', 'status: active', 'properties:', '  visible: [tags, created]');
    const hidden = writeDocument(doc, (state) => removeSystemPropertyLines(state, 'tags'));

    expect(frontmatterLines(hidden)).toEqual([ID, 'A: 1', 'tags:', '  - x', 'B: 2', CREATED, 'favorite: false', 'status: active', 'properties:', '  visible: [created]']);

    const shown = writeDocument(hidden, (state) => addSystemPropertyLines(state, 'tags'));

    expect(frontmatterLines(shown).slice(0, 6)).toEqual([ID, 'A: 1', 'tags:', '  - x', 'B: 2', CREATED]);
    expect(keysOf(...frontmatterLines(shown))).toEqual(['A', 'tags', 'B', 'created']);
  });
});

describe('Example 4 — reordering a system property', () => {
  const BEFORE = documentOf(
    ID,
    CREATED,
    'Manual properties: here',
    'Priority: High',
    MODIFIED,
    'favorite: false',
    'icon: 🍄',
    'status: active',
    'Name: This is weft',
    'tags:',
    '  - test-tag',
    '',
    'properties:',
    '  visible:',
    '    - created',
    '    - modified',
    '    - aliases',
    '    - tags'
  );

  it('dragging Tags above Created moves the whole `tags` entry; `visible` and every other entry stay', () => {
    const state = readDocument(BEFORE).state;
    const keys = readPropertySequence(state).map((ref) => ref.key);

    expect(keys).toEqual(['created', 'Manual properties', 'Priority', 'modified', 'Name', 'tags', 'aliases']);

    const after = written(BEFORE, (s) => reorderPropertiesLines(s, ['tags', 'created', 'Manual properties', 'Priority', 'modified', 'Name', 'aliases'], 'tags'));

    expect(after).toEqual([
      ID,
      'tags:',
      '  - test-tag',
      CREATED,
      'Manual properties: here',
      'Priority: High',
      MODIFIED,
      'favorite: false',
      'icon: 🍄',
      'status: active',
      'Name: This is weft',
      'properties:',
      '  visible:',
      '    - created',
      '    - modified',
      '    - aliases',
      '    - tags',
    ]);
  });

  it('the resulting display order reflects the move', () => {
    const after = frontmatterLines(
      writeDocument(BEFORE, (s) => reorderPropertiesLines(s, ['tags', 'created', 'Manual properties', 'Priority', 'modified', 'Name', 'aliases'], 'tags'))
    );

    expect(keysOf(...after)).toEqual(['tags', 'created', 'Manual properties', 'Priority', 'modified', 'Name', 'aliases']);
  });

  it('moving a property down places its entry right after the one it now follows', () => {
    const after = written(BEFORE, (s) => reorderPropertiesLines(s, ['Manual properties', 'created', 'Priority', 'modified', 'Name', 'tags', 'aliases'], 'created'));

    expect(after.slice(0, 4)).toEqual([ID, 'Manual properties: here', CREATED, 'Priority: High']);
  });

  it('hidden entries between two properties stay where they were when a neighbour moves', () => {
    // `favorite`, `icon` and `status` sit between Priority/modified and Name; Name moves above modified.
    const after = written(BEFORE, (s) => reorderPropertiesLines(s, ['created', 'Manual properties', 'Priority', 'Name', 'modified', 'tags', 'aliases'], 'Name'));

    expect(after.slice(0, 11)).toEqual([ID, CREATED, 'Manual properties: here', 'Priority: High', 'Name: This is weft', MODIFIED, 'favorite: false', 'icon: 🍄', 'status: active', 'tags:', '  - test-tag']);
  });
});

describe('Example 5 — reordering moves the complete entry', () => {
  const NESTED = documentOf(
    ID,
    'project:',
    '  name: Clutter',
    '  settings:',
    '    priority: high',
    '    archived: false',
    '',
    'Owner: Vikram',
    'favorite: false',
    'status: active'
  );

  it('moving Owner above project moves Owner and leaves the whole project mapping intact', () => {
    expect(written(NESTED, (state) => reorderPropertiesLines(state, ['Owner', 'project'], 'Owner'))).toEqual([
      ID,
      'Owner: Vikram',
      'project:',
      '  name: Clutter',
      '  settings:',
      '    priority: high',
      '    archived: false',
      'favorite: false',
      'status: active',
    ]);
  });

  it('moving project below Owner moves the whole mapping, not just its first line', () => {
    expect(written(NESTED, (state) => reorderPropertiesLines(state, ['Owner', 'project'], 'project'))).toEqual([
      ID,
      'Owner: Vikram',
      'project:',
      '  name: Clutter',
      '  settings:',
      '    priority: high',
      '    archived: false',
      'favorite: false',
      'status: active',
    ]);
  });

  it('a block list moves with its items, and comments inside the entry go with it', () => {
    const doc = documentOf(ID, 'people:', '  - Ana', '  # a note', '  - Bo', 'Owner: Vikram', 'favorite: false', 'status: active');

    expect(written(doc, (state) => reorderPropertiesLines(state, ['Owner', 'people'], 'Owner'))).toEqual([
      ID,
      'Owner: Vikram',
      'people:',
      '  - Ana',
      '  # a note',
      '  - Bo',
      'favorite: false',
      'status: active',
    ]);
  });

  it('a quoted key such as "Project: Name" is one entry, moved whole, and keeps its name', () => {
    const doc = documentOf(ID, '"Project: Name": Clutter', 'plain: 1', 'favorite: false', 'status: active');
    const state = readDocument(doc).state;

    expect(readPropertySequence(state).map((ref) => ref.key)).toEqual(['Project: Name', 'plain']);
    expect(written(doc, (s) => reorderPropertiesLines(s, ['plain', 'Project: Name'], 'plain'))).toEqual([
      ID,
      'plain: 1',
      '"Project: Name": Clutter',
      'favorite: false',
      'status: active',
    ]);
  });

  it('the entries around the configuration block move around it, and the block is last afterwards', () => {
    const doc = documentOf(ID, 'A: 1', 'properties:', '  visible: [created]', 'B: 2', CREATED, 'favorite: false', 'status: active');

    expect(written(doc, (state) => reorderPropertiesLines(state, ['B', 'A', 'created'], 'B'))).toEqual([
      ID,
      'B: 2',
      'A: 1',
      CREATED,
      'favorite: false',
      'status: active',
      'properties:',
      '  visible: [created]',
    ]);
  });

  it('the same order writes nothing', () => {
    expect(reorderPropertiesLines(readDocument(NESTED).state, ['project', 'Owner'])).toBeNull();
    expect(reorderPropertiesLines(readDocument(NESTED).state, ['ghost'])).toBeNull();
  });

  it('a reorder keeps `show` and other settings under `properties`', () => {
    const doc = documentOf(ID, 'A: 1', 'B: 2', 'properties:', '  show: false', '  other: 1', '  visible: [created]', CREATED, 'favorite: false', 'status: active');
    const after = written(doc, (state) => reorderPropertiesLines(state, ['B', 'A', 'created'], 'B'));

    expect(after).toContain('  show: false');
    expect(after).toContain('  other: 1');
  });
});

describe('custom properties — add, rename, delete', () => {
  const DOC = documentOf(ID, 'a: 1', 'properties:', '  visible: [created]', 'b: 2', CREATED, 'favorite: false', 'status: active');

  it('a new custom property is appended after the existing entries, without moving the block relative to them beyond putting it last', () => {
    const after = written(DOC, (state) => addCustomPropertyLines(state, 'c', { type: 'text', value: 'v' }));

    expect(after).toEqual([ID, 'a: 1', 'b: 2', CREATED, 'favorite: false', 'status: active', 'c: v', 'properties:', '  visible: [created]']);
    expect(keysOf(...after)).toEqual(['a', 'b', 'created', 'c']);
  });

  it('renaming keeps the entry where it is', () => {
    const after = written(DOC, (state) => renameCustomPropertyLines(state, 'b', 'bb'));

    // Not a change to the configuration: the block stays where the file had it.
    expect(after).toEqual([ID, 'a: 1', 'properties:', '  visible: [created]', 'bb: 2', CREATED, 'favorite: false', 'status: active']);
  });

  it('renaming to and from a name with a colon keeps the entry in place', () => {
    const renamed = written(DOC, (state) => renameCustomPropertyLines(state, 'b', 'Project: Name'));

    expect(renamed).toContain('"Project: Name": 2');
    expect(keysOf(...renamed)).toEqual(['a', 'Project: Name', 'created']);
    expect(frontmatterLines(writeDocument(documentOf(...renamed), (state) => renameCustomPropertyLines(state, 'Project: Name', 'b')))).toContain('b: 2');
  });

  it('deleting removes the whole entry — a nested mapping with it — and nothing else moves', () => {
    const doc = documentOf(ID, 'a: 1', 'project:', '  name: Clutter', '  settings:', '    x: 1', 'b: 2', CREATED, 'favorite: false', 'status: active');

    expect(written(doc, (state) => deleteCustomPropertyLines(state, 'project'))).toEqual([ID, 'a: 1', 'b: 2', CREATED, 'favorite: false', 'status: active']);
  });

  it('deleting the last thing to show resets the block; deleting a missing property throws', () => {
    expect(() => deleteCustomPropertyLines(stateOf(ID, 'a: 1'), 'ghost')).toThrow(/No custom property/);
    expect(written(documentOf(ID, 'a: 1', 'properties:', '  show: true', 'favorite: false', 'status: active'), (state) => deleteCustomPropertyLines(state, 'a'))).toEqual([
      ID,
      'favorite: false',
      'status: active',
    ]);
  });

  it('delete all removes every custom property and the block, leaving the system entries', () => {
    const doc = documentOf(ID, 'a: 1', CREATED, 'b: 2', 'properties:', '  visible: [created]', 'favorite: false', 'status: active');

    expect(written(doc, (state) => deleteAllPropertiesLines(state))).toEqual([ID, CREATED, 'favorite: false', 'status: active']);
  });

  it('a deleted property that is added again goes last', () => {
    const removed = writeDocument(DOC, (state) => deleteCustomPropertyLines(state, 'a'));
    const readded = frontmatterLines(writeDocument(removed, (state) => addCustomPropertyLines(state, 'a', { type: 'text', value: 'x' })));

    expect(keysOf(...readded)).toEqual(['b', 'created', 'a']);
  });
});

describe('an `order` list an earlier build wrote', () => {
  it('is read for visibility until a write adopts it: the system keys it named become `visible`, `order` goes, nothing is reordered', () => {
    const doc = documentOf(ID, 'a: 1', CREATED, 'properties:', '  other: 1', '  order:', '    - created', '    - a', '    - tags', 'favorite: false', 'status: active');

    expect(keysOf(...frontmatterLines(doc))).toEqual(['a', 'created', 'tags']);

    const after = written(doc, (state) => addCustomPropertyLines(state, 'b', { type: 'text', value: 'x' }));

    expect(after).toEqual([ID, 'a: 1', CREATED, 'favorite: false', 'status: active', 'b: x', 'properties:', '  other: 1', '  visible:', '    - tags', '    - created']);
  });

  it('with a `visible` list too, `visible` is kept and `order` is dropped', () => {
    const doc = documentOf(ID, 'a: 1', 'properties:', '  visible: [aliases]', '  order: [a, tags]', 'favorite: false', 'status: active');
    const after = written(doc, (state) => removeSystemPropertyLines(state, 'aliases'));

    expect(after.join('\n')).not.toContain('order');
    expect(after).toEqual([ID, 'a: 1', 'favorite: false', 'status: active']);
  });

  it('is not touched by a note that is only read', () => {
    const doc = documentOf(ID, 'properties:', '  order: [tags]');

    expect(removeSystemPropertyLines(readDocument(doc).state, 'created')).toBeNull();
  });
});
