import { Section } from '@components/sidebar/section/Sidebar.Section';
import { Tag } from '../components/Tag';
import type { Tag as TagModel } from '../models/Tag';

export function renderTags(tags: TagModel[]) {
  const favoriteTags = tags.filter((tag) => tag.isFavorite);
  const otherTags = tags.filter((tag) => !tag.isFavorite);

  return (
    <>
      {/* Section title will not be visible untill we use the "hasHeader" prop */}
      <Section hasHeader title="Favorites">
        {favoriteTags.map((tag) => (
          <Tag
            key={tag.id}
            title={tag.title}
            color={tag.color}
            isFavorite={true}
            onClick={() => {}}
          />
        ))}
      </Section>
      <Section hasHeader title="Others">
        {otherTags.map((tag) => (
          <Tag
            key={tag.id}
            title={tag.title}
            color={tag.color}
            isFavorite={true}
            onClick={() => {}}
          />
        ))}
      </Section>
    </>
  );
}
