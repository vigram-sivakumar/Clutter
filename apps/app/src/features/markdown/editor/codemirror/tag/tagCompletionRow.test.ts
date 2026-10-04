import { describe, expect, it } from 'vitest';

import { tagRow } from './tagCompletionRow';

describe('tagRow', () => {
  it('shows the tag\'s name without the "#" — the icon says it is a tag', () => {
    expect(tagRow('project/clutter')).toMatchObject({ title: 'project/clutter' });
  });
});
