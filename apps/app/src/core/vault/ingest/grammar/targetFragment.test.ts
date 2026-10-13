import { describe, expect, it } from 'vitest';

import { splitTargetFragment } from './targetFragment';

describe('splitTargetFragment', () => {
  it.each([
    ['Note', 'Note', null],
    ['Projects/Note', 'Projects/Note', null],
    ['Note#Decisions', 'Note', 'Decisions'],
    ['Note#^decision-1', 'Note', '^decision-1'],
    ['Note#', 'Note', ''],
    ['Note#A#B', 'Note', 'A#B'],
    ['#Heading', '', 'Heading'],
  ])('%j -> note %j, fragment %j', (target, pagePart, fragment) => {
    expect(splitTargetFragment(target)).toEqual({ pagePart, fragment });
  });
});
