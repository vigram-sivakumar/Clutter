import { describe, expect, it } from 'vitest';

import { tagCreateRow, tagRow } from './tagCompletionRow';

describe('tagRow', () => {
  it('shows the tag\'s name without the "#" — the icon says it is a tag', () => {
    expect(tagRow('project/clutter')).toMatchObject({ title: 'project/clutter' });
  });

  it('is a compact row, so the tag popup takes the small dialog width', () => {
    expect(tagRow('x').compact).toBe(true);
    expect(tagCreateRow('x').compact).toBe(true);
  });
});

describe('tagCreateRow', () => {
  it('reads Create "name" with the plus icon, as a new note does in [[', () => {
    const row = tagCreateRow('newtag');

    expect(row.title).toBe('Create "newtag"');
    expect(row.iconSvg).toBeTruthy();
  });
});
