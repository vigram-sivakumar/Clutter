import { describe, expect, it } from 'vitest';

import type { Page } from '@core/vault/models/Page';

import { getSourceNoteHeadings } from './sourceNoteHeadings';

const ROOT = '/vault';

const note = (id: string, relativePath: string): Page =>
  ({
    id,
    type: 'note',
    name: relativePath.split('/').pop()!.replace(/\.md$/, ''),
    path: `${ROOT}/${relativePath}`,
    metadata: { description: null },
    source: { markdown: '' },
  }) as unknown as Page;

const headings = (...pages: Page[]) =>
  Object.fromEntries(getSourceNoteHeadings(pages, ROOT));

describe('getSourceNoteHeadings', () => {
  it('shows just the title when no other source note has it', () => {
    expect(
      headings(note('a', 'Projects/Ideas.md'), note('b', 'Notes/Plan.md'))
    ).toEqual({ a: 'Ideas', b: 'Plan' });
  });

  it('adds the immediate parent folder to notes with the same title in different folders', () => {
    expect(
      headings(
        note('a', 'Work/Design/Ideas.md'),
        note('b', 'Work/Research/Ideas.md')
      )
    ).toEqual({ a: 'Design / Ideas', b: 'Research / Ideas' });
  });

  it('never shows the root: a root note keeps its title, its namesake in a folder gets the folder', () => {
    expect(
      headings(note('a', 'Ideas.md'), note('b', 'Design/Ideas.md'))
    ).toEqual({ a: 'Ideas', b: 'Design / Ideas' });
  });

  it('uses the full folder path when title and immediate parent are both the same', () => {
    expect(
      headings(
        note('a', 'Work/Design/Ideas.md'),
        note('b', 'Home/Design/Ideas.md')
      )
    ).toEqual({ a: 'Work / Design / Ideas', b: 'Home / Design / Ideas' });
  });

  it('falls back to the full path only for the notes that still clash', () => {
    expect(
      headings(
        note('a', 'Work/Design/Ideas.md'),
        note('b', 'Home/Design/Ideas.md'),
        note('c', 'Research/Ideas.md')
      )
    ).toEqual({
      a: 'Work / Design / Ideas',
      b: 'Home / Design / Ideas',
      c: 'Research / Ideas',
    });
  });

  it('lists a page once however many times it is given, and does not count it against itself', () => {
    const only = note('a', 'Work/Ideas.md');

    expect(headings(only, only, only)).toEqual({ a: 'Ideas' });
  });

  it('tracks a rename or move by page id: the same id gets new text, nothing else changes', () => {
    const other = note('b', 'Design/Ideas.md');

    expect(headings(note('a', 'Ideas.md'), other)).toEqual({
      a: 'Ideas',
      b: 'Design / Ideas',
    });
    // `a` moves into a folder, then is renamed.
    expect(headings(note('a', 'Research/Ideas.md'), other)).toEqual({
      a: 'Research / Ideas',
      b: 'Design / Ideas',
    });
    expect(headings(note('a', 'Research/Roadmap.md'), other)).toEqual({
      a: 'Roadmap',
      b: 'Ideas',
    });
  });
});
