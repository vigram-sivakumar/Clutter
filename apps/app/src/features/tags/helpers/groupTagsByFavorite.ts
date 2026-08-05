import type { Tag } from '@core/vault/models/Tag';

export interface GroupedTags {
  readonly favorites: readonly Tag[];
  readonly others: readonly Tag[];
}

/**
 * Partitions tags by their own favorite flag — every tag lands in exactly
 * one group, never both, and a tag with favorite: false can never end up
 * in favorites by omission (see Tag.favorite's own doc comment). Grouping
 * lives here, as testable logic, rather than as inline JSX filters in the
 * render function — the bug this replaced was two unconditional `.map()`
 * calls over the same full list, which is exactly the shape a UI
 * conditional would have re-introduced instead of fixed.
 *
 * Relies on vault.tags() already being alphabetically sorted (TagBuilder)
 * — filter/push both preserve relative order, so favorites and others each
 * stay alphabetically ordered independently with no extra sort here.
 */
export function groupTagsByFavorite(tags: readonly Tag[]): GroupedTags {
  const favorites: Tag[] = [];
  const others: Tag[] = [];

  for (const tag of tags) {
    (tag.favorite ? favorites : others).push(tag);
  }

  return { favorites, others };
}
