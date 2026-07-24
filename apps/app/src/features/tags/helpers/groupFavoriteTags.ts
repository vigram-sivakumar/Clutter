import type { Tag } from '@core/vault/models/Tag';

// Shape of the grouped result.
type TagGroups = {
  favorite: readonly Tag[];
  others: readonly Tag[];
};

export function groupFavoriteTags(tags: readonly Tag[]): TagGroups {
  return {
    favorite: [],
    others: [...tags],
  };
}
