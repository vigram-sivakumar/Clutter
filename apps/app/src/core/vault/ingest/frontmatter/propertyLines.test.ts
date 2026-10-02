import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '../FrontmatterParser';
import {
  addCustomPropertyLines,
  addSystemPropertyLines,
  deleteAllPropertiesLines,
  deleteCustomPropertyLines,
  removeSystemPropertyLines,
  setSectionHiddenLines,
} from './propertyLines';

const lines = (yaml: string): readonly string[] =>
  new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];

describe('propertyLines — every change returns null when nothing would change', () => {
  it.each([
    ['addSystemProperty already listed', () => addSystemPropertyLines(lines('properties:\n  visible:\n    - tags'), 'tags')],
    ['removeSystemProperty not listed', () => removeSystemPropertyLines(lines('priority: high'), 'tags')],
    ['setSectionHidden(false) with no override', () => setSectionHiddenLines(lines('priority: high'), false)],
    ['setSectionHidden(true) already hidden', () => setSectionHiddenLines(lines('properties:\n  show: false'), true)],
    ['deleteAllProperties with nothing to delete', () => deleteAllPropertiesLines(lines(''))],
  ])('%s', (_label, run) => {
    expect(run()).toBeNull();
  });
});

describe('propertyLines — one implementation of each change', () => {
  it('adding then removing a system property round-trips to the zero-property state', () => {
    const added = addSystemPropertyLines(lines(''), 'tags')!;
    expect(added).toEqual(['properties:', '  visible:', '    - tags']);

    expect(removeSystemPropertyLines(added, 'tags')).toEqual([]);
  });

  it('a custom property keeps the note displaying after the last system property goes', () => {
    const result = removeSystemPropertyLines(lines('priority: high\nproperties:\n  visible:\n    - tags'), 'tags');

    expect(result).toEqual(['priority: high']);
  });

  it('adding a custom property lists nothing, and lifts an explicit hide', () => {
    expect(
      addCustomPropertyLines(lines('properties:\n  show: false\n  visible:\n    - tags'), 'Notes', {
        type: 'text',
        value: null,
      })
    ).toEqual(['properties:', '  visible:', '    - tags', 'Notes:']);
  });

  it('deleting a custom property that is not there throws; deleting the last thing to show resets the block', () => {
    expect(() => deleteCustomPropertyLines(lines('priority: high'), 'ghost')).toThrow(/No custom property/);
    expect(deleteCustomPropertyLines(lines('priority: high\nproperties:\n  show: true'), 'priority')).toEqual([]);
  });

  it('delete all removes every custom property and the whole block, never writing show or visible', () => {
    const result = deleteAllPropertiesLines(lines('a: 1\nb: 2\nproperties:\n  show: false\n  visible: [tags]'))!;

    expect(result).toEqual([]);
  });
});
