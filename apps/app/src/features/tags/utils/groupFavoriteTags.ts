import { Tag } from '../models/Tag';

// Shape of the grouped result.
type TagGroups = {
  favorite: Tag[];
  others: Tag[];
};

export function groupFavoriteTags(tags: Tag[]): TagGroups {
  // Starting object for reduce().
  const createInitialGroups = (): TagGroups => ({ favorite: [], others: [] });

  return tags.reduce((groups, tag) => {
    // Decide which group this tag belongs to.
    let group: keyof TagGroups;

    if (tag.isFavorite) {
      group = 'favorite';
    } else {
      group = 'others';
    }

    // Add the tag to the selected group.
    groups[group].push(tag);

    // Return the updated accumulator for the next iteration.
    return groups;
  }, createInitialGroups());
}
