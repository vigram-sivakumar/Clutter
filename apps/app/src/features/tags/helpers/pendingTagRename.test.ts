import { describe, expect, it } from 'vitest';

import type { Tag } from '@core/vault/models/Tag';

import { applyPendingTagRenames } from './pendingTagRename';

const tag = (name: string, extra: Partial<Tag> = {}): Tag => ({
  name,
  favorite: false,
  declared: false,
  usageCount: 1,
  ...extra,
});
const pinned = (name: string, usageCount = 1): Tag => tag(name, { favorite: true, declared: true, icon: '📦', usageCount });
const names = (tags: readonly Tag[]) => tags.map((t) => t.name);

describe('applyPendingTagRenames', () => {
  it('with nothing pending, returns the very same list', () => {
    const tags = [tag('a'), tag('b')];

    expect(applyPendingTagRenames(tags, [])).toBe(tags);
  });

  it('before any note is rewritten: the old tag is shown under the new name, pinned, with its emoji and count', () => {
    const result = applyPendingTagRenames([pinned('alpha', 3), tag('zeta')], [{ oldName: 'alpha', newName: 'gamma' }]);

    expect(names(result)).toEqual(['gamma', 'zeta']);
    expect(result[0]).toMatchObject({ favorite: true, declared: true, icon: '📦', usageCount: 3 });
  });

  it('mid-rename: the old pinned tag and the new, not-yet-pinned tag are ONE pinned tag with both counts', () => {
    const tags = [pinned('alpha', 1), tag('gamma', { usageCount: 2 }), tag('zeta')];

    const result = applyPendingTagRenames(tags, [{ oldName: 'alpha', newName: 'gamma' }]);

    expect(names(result)).toEqual(['gamma', 'zeta']);
    expect(result[0]).toMatchObject({ favorite: true, icon: '📦', usageCount: 3 });
  });

  it('once the old tag is gone, the real new tag (which now carries its own definition) is shown as it is', () => {
    const tags = [pinned('gamma', 3), tag('zeta')];

    expect(applyPendingTagRenames(tags, [{ oldName: 'alpha', newName: 'gamma' }])).toEqual(tags);
  });

  it('an unpinned, undeclared tag is renamed on screen too, and stays unpinned', () => {
    const result = applyPendingTagRenames([tag('alpha'), tag('beta')], [{ oldName: 'alpha', newName: 'gamma' }]);

    expect(names(result)).toEqual(['beta', 'gamma']);
    expect(result.find((t) => t.name === 'gamma')).toMatchObject({ favorite: false });
  });

  it('puts the renamed tag where its new name sorts, case-insensitively, leaving the others in order', () => {
    const tags = [pinned('alpha'), pinned('beta'), pinned('delta'), tag('zeta')];

    expect(names(applyPendingTagRenames(tags, [{ oldName: 'alpha', newName: 'Charlie' }]))).toEqual([
      'beta',
      'Charlie',
      'delta',
      'zeta',
    ]);
  });

  it('respelling the same tag ("Project" → "project") shows the new spelling, once', () => {
    const result = applyPendingTagRenames([pinned('Project', 2), tag('zeta')], [{ oldName: 'Project', newName: 'project' }]);

    expect(names(result)).toEqual(['project', 'zeta']);
    expect(result[0]).toMatchObject({ favorite: true, usageCount: 2 });
  });

  it('matches the old tag under any spelling (tag identity), and never touches other tags', () => {
    const others = [tag('beta'), tag('zeta')];
    const result = applyPendingTagRenames([pinned('Product-design'), ...others], [{ oldName: 'product_design', newName: 'ux' }]);

    expect(names(result)).toEqual(['beta', 'ux', 'zeta']);
    expect(result.filter((t) => t.name === 'beta' || t.name === 'zeta')).toEqual(others);
  });

  it('a pending rename of a tag that does not exist changes nothing', () => {
    const tags = [tag('a'), tag('b')];

    expect(applyPendingTagRenames(tags, [{ oldName: 'missing', newName: 'x' }])).toEqual(tags);
  });

  it('applies several pending renames, each on its own tag', () => {
    const tags = [pinned('a'), pinned('b'), tag('z')];

    const result = applyPendingTagRenames(tags, [
      { oldName: 'a', newName: 'm' },
      { oldName: 'b', newName: 'n' },
    ]);

    expect(names(result)).toEqual(['m', 'n', 'z']);
    expect(result.filter((t) => t.favorite).map((t) => t.name)).toEqual(['m', 'n']);
  });

  it('does not mutate the list it is given', () => {
    const tags = [pinned('alpha'), tag('zeta')];
    const before = [...tags];

    applyPendingTagRenames(tags, [{ oldName: 'alpha', newName: 'gamma' }]);

    expect(tags).toEqual(before);
  });
});
