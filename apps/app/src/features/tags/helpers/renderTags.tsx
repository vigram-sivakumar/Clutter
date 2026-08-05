import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import { Tag } from '../sidebar/Tag';
import { groupTagsByFavorite } from './groupTagsByFavorite';
import type { Tag as TagModel } from '@core/vault/models/Tag';

export function renderTags(
  tags: readonly TagModel[],
  onOpenTag: (name: string) => void
) {
  const { favorites, others } = groupTagsByFavorite(tags);

  return (
    <>
      <FavoritesSection isEmpty={favorites.length === 0} title="Favorites">
        {favorites.map((tag) => (
          <Tag
            key={tag.name}
            title={tag.name}
            emoji={tag.icon}
            count={tag.usageCount}
            isFavorite
            onClick={() => onOpenTag(tag.name)}
          />
        ))}
      </FavoritesSection>
      {/* No header when Favorites is hidden — this is the only visible
          section, so a group label would be redundant. */}
      <Section hasHeader={favorites.length > 0} title="Others">
        {others.map((tag) => (
          <Tag
            key={tag.name}
            title={tag.name}
            emoji={tag.icon}
            count={tag.usageCount}
            onClick={() => onOpenTag(tag.name)}
          />
        ))}
      </Section>
    </>
  );
}
