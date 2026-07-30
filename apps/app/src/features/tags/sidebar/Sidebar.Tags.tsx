import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { TagsNavigation } from '@features/tags/navigation/TagsNavigation';
import { renderTags } from '../helpers/renderTags';
import type { Vault } from '@core/vault/models';

interface TagsPanelProps {
  readonly vault: Vault;
}

export function Tags({ vault }: TagsPanelProps) {
  const tags = [...vault.tags()];

  return <View navigation={<TagsNavigation />}>{renderTags(tags)}</View>;
}
