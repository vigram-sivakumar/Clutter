import { Section } from '@app/layouts/sidebar/section/Section';
import { Tag } from '../sidebar/Tag';
import type { Tag as TagModel } from '@core/vault/models/Tag';

export function renderTags(tags: readonly TagModel[]) {
  return (
    <>
      {/* TODO: Render the favorites section only when they exist */}
      <Section hasHeader title="Favorites">
        {tags.map((tag) => (
          <Tag
            key={tag.name}
            title={tag.name}
            count={0}
            isFavorite
            onClick={() => {}}
          />
        ))}
      </Section>
      <Section hasHeader title="Others">
        {tags.map((tag) => (
          <Tag key={tag.name} title={tag.name} count={0} onClick={() => {}} />
        ))}
      </Section>
    </>
  );
}
