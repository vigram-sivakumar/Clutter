import { describe, expect, it } from 'vitest';
import { groupTagsByFavorite } from './groupTagsByFavorite';
import type { Tag } from '@core/vault/models/Tag';

function tag(name: string, favorite: boolean): Tag {
  return { name, favorite, usageCount: 0 };
}

describe('groupTagsByFavorite', () => {
  it('puts a favorite: true tag only in favorites', () => {
    const { favorites, others } = groupTagsByFavorite([tag('project', true)]);

    expect(favorites).toEqual([tag('project', true)]);
    expect(others).toEqual([]);
  });

  it('puts a favorite: false tag only in others', () => {
    const { favorites, others } = groupTagsByFavorite([tag('project', false)]);

    expect(favorites).toEqual([]);
    expect(others).toEqual([tag('project', false)]);
  });

  it('never places the same tag in both groups', () => {
    const tags = [tag('project', true), tag('design', false), tag('react', true)];
    const { favorites, others } = groupTagsByFavorite(tags);

    const favoriteNames = favorites.map((t) => t.name);
    const otherNames = others.map((t) => t.name);

    expect(favoriteNames.some((name) => otherNames.includes(name))).toBe(false);
    expect(favorites.length + others.length).toBe(tags.length);
  });

  it('preserves input order within each group (relies on vault.tags() already being sorted)', () => {
    const tags = [
      tag('architecture', true),
      tag('design', false),
      tag('groceries', true),
      tag('react', false),
    ];

    const { favorites, others } = groupTagsByFavorite(tags);

    expect(favorites.map((t) => t.name)).toEqual(['architecture', 'groceries']);
    expect(others.map((t) => t.name)).toEqual(['design', 'react']);
  });

  it('returns empty groups for an empty input', () => {
    expect(groupTagsByFavorite([])).toEqual({ favorites: [], others: [] });
  });
});
