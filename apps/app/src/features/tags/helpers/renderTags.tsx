import { Section } from '@app/layouts/sidebar/section/Section';
import { Tag } from '../components/Tag';
import type { Tag as TagModel } from '@core/vault/models/Tag';

export function renderTags(tags: readonly TagModel[]) {
  return (
    <Section>
      {tags.map((tag) => (
        <Tag key={tag.name} title={tag.name} onClick={() => {}} />
      ))}
    </Section>
  );
}
