import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import { Tag } from '../sidebar/Tag';
import { groupTagsByFavorite } from './groupTagsByFavorite';
import type { Tag as TagModel } from '@core/vault/models/Tag';

export function renderTags(tags: readonly TagModel[]) {
  const { favorites, others } = groupTagsByFavorite(tags);

  return (
    <>
      <FavoritesSection isEmpty={favorites.length === 0} title="Favorites">
        {favorites.map((tag) => (
          <Tag
            key={tag.name}
            title={tag.name}
            emoji={tag.icon}
            count={0}
            isFavorite
            onClick={() => {}}
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
            count={0}
            onClick={() => {}}
          />
        ))}
      </Section>
    </>
  );
}
