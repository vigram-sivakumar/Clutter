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
const CREATED = 'created: true';
const MODIFIED = 'modified: true';

/** The spec's example: system and custom entries mixed, `showProperties` in the middle. */
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
  'showProperties: true',
  '',
  'Name: This is weft'
);

describe('what the Properties list shows — the physical order of the entries', () => {
  it('custom and declared system properties in file order; `showProperties` and other metadata are not rows', () => {
    expect(keysOf(...frontmatterLines(EXAMPLE_1))).toEqual(['created', 'Manual properties', 'Priority', 'modified', 'Name']);
  });

  it('`Name` is an ordinary custom property — neither a system property nor the title', () => {
    const { page, state } = readDocument(EXAMPLE_1);

    expect(readPropertySequence(state).find((ref) => ref.key === 'Name')).toEqual({ kind: 'custom', key: 'Name' });
    expect(page.name).not.toBe('This is weft');
  });

  it('a system property shows when its key is an entry of the file — whatever its entry holds, even nothing', () => {
    expect(keysOf(ID, 'tags:', '  - a', CREATED, 'Priority: High')).toEqual(['tags', 'created', 'Priority']);
    expect(keysOf(ID, 'tags: []', 'aliases: []')).toEqual(['tags', 'aliases']);
    expect(keysOf(ID, 'Priority: High')).toEqual(['Priority']);
  });

  it('system and custom properties interleave exactly as their entries do', () => {
    expect(keysOf(ID, 'Alpha: 1', CREATED, 'Beta: 2', 'tags:', '  - x', 'Gamma: 3')).toEqual(['Alpha', 'created', 'Beta', 'tags', 'Gamma']);
  });

  it('`showProperties` between property entries is not a row, and `kind: template` never is', () => {
    expect(keysOf(ID, 'A: 1', 'showProperties: false', 'B: 2', 'kind: template', CREATED)).toEqual(['A', 'B', 'created']);
  });

  it('a note with no recorded order (not read from a file) shows only its custom properties', () => {
    expect(readPropertySequence({ lines: ['b: 1'] }).map((ref) => ref.key)).toEqual(['b']);
  });

  it('a nested mapping or a block list is one custom property', () => {
    expect(keysOf(ID, 'project:', '  name: Clutter', '  settings:', '    priority: high', 'Owner: Vikram')).toEqual(['project', 'Owner']);
  });
});

describe('a relevant write changes only what it names', () => {
  it('removing aliases deletes its entry; the other entries keep their order', () => {
    const doc = documentOf(ID, CREATED, 'Priority: High', 'aliases:', '  - Alt', MODIFIED, 'favorite: false', 'status: active');

    expect(written(doc, (state) => removeSystemPropertyLines(state, 'aliases'))).toEqual([ID, CREATED, 'Priority: High', MODIFIED, 'favorite: false', 'status: active']);
  });

  it('adding a custom property appends it after the entries, without regrouping system properties', () => {
    expect(written(EXAMPLE_1, (state) => addCustomPropertyLines(state, 'Extra', { type: 'text', value: 'x' }))).toEqual([
      ID,
      CREATED,
      'Manual properties: here',
      'Priority: High',
      MODIFIED,
      'favorite: false',
      'icon: 🍄',
      'status: active',
      'showProperties: true',
      'Name: This is weft',
      'Extra: x',
    ]);
  });

  it('a change that changes nothing returns null', () => {
    const state = stateOf(...frontmatterLines(EXAMPLE_1));

    expect(removeSystemPropertyLines(state, 'tags')).toBeNull();
    expect(addSystemPropertyLines(state, 'created')).toBeNull();
    expect(setSectionHiddenLines(state, false)).toBeNull();
    expect(reorderPropertiesLines(state, keysOf(...frontmatterLines(EXAMPLE_1)))).toBeNull();
  });
});

describe('showProperties', () => {
  it('hiding rewrites the existing entry in place and moves nothing', () => {
    const hidden = written(EXAMPLE_1, (state) => setSectionHiddenLines(state, true));

    expect(hidden).toEqual([ID, CREATED, 'Manual properties: here', 'Priority: High', MODIFIED, 'favorite: false', 'icon: 🍄', 'status: active', 'showProperties: false', 'Name: This is weft']);
  });

  it('hiding appends the entry to a note without one, and every property is still declared', () => {
    const doc = documentOf(ID, CREATED, 'A: 1', 'tags: []');
    const hidden = written(doc, (state) => setSectionHiddenLines(state, true));

    expect(hidden).toContain('showProperties: false');
    expect(keysOf(...hidden)).toEqual(['created', 'A', 'tags']);
  });

  it('showing removes the entry; hide then show returns the original frontmatter', () => {
    const doc = documentOf(ID, CREATED, 'A: 1', 'tags: []');
    const hidden = writeDocument(doc, (state) => setSectionHiddenLines(state, true));
    const shown = writeDocument(hidden, (state) => setSectionHiddenLines(state, false));

    expect(frontmatterLines(shown)).toEqual(frontmatterLines(writeDocument(doc, (state) => state)));
    expect(frontmatterLines(shown).join('\n')).not.toContain('showProperties');
  });

  it('adding any property lifts a hide', () => {
    const hidden = documentOf(ID, 'showProperties: false', 'A: 1');

    expect(written(hidden, (state) => addCustomPropertyLines(state, 'B', { type: 'text', value: 'x' }))).toEqual([ID, 'A: 1', 'B: x', 'favorite: false', 'status: active']);
    expect(written(hidden, (state) => addSystemPropertyLines(state, 'tags'))).toEqual([ID, 'A: 1', 'tags: []', 'favorite: false', 'status: active']);
  });
});

describe('adding a system property', () => {
  const BEFORE = documentOf(ID, CREATED, 'Manual properties: here', 'Priority: High', MODIFIED, 'favorite: false', 'icon: 🍄', 'status: active', 'Name: This is weft');

  it('with no entry yet: appends the entry after the property entries — an empty list for tags, `true` for a date', () => {
    expect(written(BEFORE, (state) => addSystemPropertyLines(state, 'tags'))).toEqual([
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
    ]);

    const noDates = documentOf(ID, 'A: 1');
    expect(written(noDates, (state) => addSystemPropertyLines(state, 'created')).filter((line) => line.startsWith('created'))).toEqual(['created: true']);
    expect(written(noDates, (state) => addSystemPropertyLines(state, 'modified')).filter((line) => line.startsWith('modified'))).toEqual(['modified: true']);
  });

  it('shows after Name — its entry follows Name', () => {
    const after = written(BEFORE, (state) => addSystemPropertyLines(state, 'tags'));

    expect(keysOf(...after)).toEqual(['created', 'Manual properties', 'Priority', 'modified', 'Name', 'tags']);
  });

  it('with an entry already there: it is already listed — nothing is written, nothing duplicated or moved', () => {
    const declared = documentOf(ID, 'tags:', '  - test-tag', CREATED, 'Priority: High', 'favorite: false', 'status: active');

    expect(addSystemPropertyLines(readDocument(declared).state, 'tags')).toBeNull();
  });

  it('removing deletes the entry and its value; adding again declares an empty one at the end', () => {
    const doc = documentOf(ID, 'A: 1', 'tags:', '  - x', 'B: 2', CREATED, 'favorite: false', 'status: active');
    const removed = writeDocument(doc, (state) => removeSystemPropertyLines(state, 'tags'));

    expect(frontmatterLines(removed)).toEqual([ID, 'A: 1', 'B: 2', CREATED, 'favorite: false', 'status: active']);

    const added = writeDocument(removed, (state) => addSystemPropertyLines(state, 'tags'));

    expect(frontmatterLines(added)).toEqual([ID, 'A: 1', 'B: 2', CREATED, 'favorite: false', 'status: active', 'tags: []']);
    expect(keysOf(...frontmatterLines(added))).toEqual(['A', 'B', 'created', 'tags']);
  });

  it('removing Created / Last edited deletes the key — no value to clear', () => {
    const doc = documentOf(ID, CREATED, 'A: 1', MODIFIED, 'favorite: false', 'status: active');

    expect(written(doc, (state) => removeSystemPropertyLines(state, 'created'))).toEqual([ID, 'A: 1', MODIFIED, 'favorite: false', 'status: active']);
    expect(written(doc, (state) => removeSystemPropertyLines(state, 'modified'))).toEqual([ID, CREATED, 'A: 1', 'favorite: false', 'status: active']);
  });
});

describe('reordering a system property', () => {
  const BEFORE = documentOf(ID, CREATED, 'Manual properties: here', 'Priority: High', MODIFIED, 'favorite: false', 'icon: 🍄', 'status: active', 'Name: This is weft', 'tags:', '  - test-tag');
  const ORDER = ['tags', 'created', 'Manual properties', 'Priority', 'modified', 'Name'];

  it('dragging Tags above Created moves the whole `tags` entry; every other entry stays', () => {
    expect(keysOf(...frontmatterLines(BEFORE))).toEqual(['created', 'Manual properties', 'Priority', 'modified', 'Name', 'tags']);

    expect(written(BEFORE, (s) => reorderPropertiesLines(s, ORDER, 'tags'))).toEqual([
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
    ]);
  });

  it('the resulting display order reflects the move', () => {
    expect(keysOf(...written(BEFORE, (s) => reorderPropertiesLines(s, ORDER, 'tags')))).toEqual(ORDER);
  });

  it('moving a property down places its entry right after the one it now follows', () => {
    const after = written(BEFORE, (s) => reorderPropertiesLines(s, ['Manual properties', 'created', 'Priority', 'modified', 'Name', 'tags'], 'created'));

    expect(after.slice(0, 4)).toEqual([ID, 'Manual properties: here', CREATED, 'Priority: High']);
  });

  it('hidden entries between two properties stay where they were when a neighbour moves', () => {
    const after = written(BEFORE, (s) => reorderPropertiesLines(s, ['created', 'Manual properties', 'Priority', 'Name', 'modified', 'tags'], 'Name'));

    expect(after.slice(0, 11)).toEqual([ID, CREATED, 'Manual properties: here', 'Priority: High', 'Name: This is weft', MODIFIED, 'favorite: false', 'icon: 🍄', 'status: active', 'tags:', '  - test-tag']);
  });

  it('keeps `showProperties` where it is, and writes none that was not there', () => {
    const doc = documentOf(ID, 'A: 1', 'showProperties: false', 'B: 2');

    expect(written(doc, (state) => reorderPropertiesLines(state, ['B', 'A'], 'B'))).toEqual([ID, 'B: 2', 'A: 1', 'showProperties: false', 'favorite: false', 'status: active']);
    expect(written(documentOf(ID, 'A: 1', 'B: 2'), (state) => reorderPropertiesLines(state, ['B', 'A'], 'B')).join('\n')).not.toContain('showProperties');
  });
});

describe('reordering moves the complete entry', () => {
  const NESTED = documentOf(ID, 'project:', '  name: Clutter', '  settings:', '    priority: high', '    archived: false', '', 'Owner: Vikram', 'favorite: false', 'status: active');

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

    expect(readPropertySequence(readDocument(doc).state).map((ref) => ref.key)).toEqual(['Project: Name', 'plain']);
    expect(written(doc, (s) => reorderPropertiesLines(s, ['plain', 'Project: Name'], 'plain'))).toEqual([ID, 'plain: 1', '"Project: Name": Clutter', 'favorite: false', 'status: active']);
  });

  it('the same order writes nothing', () => {
    expect(reorderPropertiesLines(readDocument(NESTED).state, ['project', 'Owner'])).toBeNull();
    expect(reorderPropertiesLines(readDocument(NESTED).state, ['ghost'])).toBeNull();
  });
});

describe('custom properties — add, rename, delete', () => {
  const DOC = documentOf(ID, 'a: 1', 'b: 2', CREATED, 'favorite: false', 'status: active');

  it('a new custom property is appended after the existing entries', () => {
    const after = written(DOC, (state) => addCustomPropertyLines(state, 'c', { type: 'text', value: 'v' }));

    expect(after).toEqual([ID, 'a: 1', 'b: 2', CREATED, 'favorite: false', 'status: active', 'c: v']);
    expect(keysOf(...after)).toEqual(['a', 'b', 'created', 'c']);
  });

  it('renaming keeps the entry where it is', () => {
    expect(written(DOC, (state) => renameCustomPropertyLines(state, 'b', 'bb'))).toEqual([ID, 'a: 1', 'bb: 2', CREATED, 'favorite: false', 'status: active']);
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

  it('deleting a missing property throws; deleting the last one leaves nothing behind', () => {
    expect(() => deleteCustomPropertyLines(stateOf(ID, 'a: 1'), 'ghost')).toThrow(/No custom property/);
    expect(() => deleteCustomPropertyLines(stateOf(ID, 'showProperties: false'), 'showProperties')).toThrow(/No custom property/);
    expect(written(documentOf(ID, 'a: 1', 'favorite: false', 'status: active'), (state) => deleteCustomPropertyLines(state, 'a'))).toEqual([ID, 'favorite: false', 'status: active']);
  });

  it('delete all removes every property — custom entries and system entries with their values — and `showProperties`', () => {
    const doc = documentOf(ID, 'a: 1', CREATED, 'b: 2', 'tags:', '  - x', 'showProperties: false', 'favorite: false', 'status: active');

    expect(written(doc, (state) => deleteAllPropertiesLines(state))).toEqual([ID, 'favorite: false', 'status: active']);
    expect(deleteAllPropertiesLines(stateOf(ID, 'favorite: false'))).toBeNull();
  });

  it('a deleted property that is added again goes last', () => {
    const removed = writeDocument(DOC, (state) => deleteCustomPropertyLines(state, 'a'));
    const readded = frontmatterLines(writeDocument(removed, (state) => addCustomPropertyLines(state, 'a', { type: 'text', value: 'x' })));

    expect(keysOf(...readded)).toEqual(['b', 'created', 'a']);
  });
});
