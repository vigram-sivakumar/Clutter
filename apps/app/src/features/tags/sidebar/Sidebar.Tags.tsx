import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import { buildTagsShortcutHandler } from '@features/tags/shortcuts/buildTagsShortcutHandler';
import { TagsShortcuts } from '@features/tags/shortcuts/TagsShortcuts';
import { renderTags } from '../helpers/renderTags';
import type { Vault } from '@core/vault/models';

interface TagsPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
}

export function Tags({ vault, navigation }: TagsPanelProps) {
  const tags = [...vault.tags()];
  const onShortcut = buildTagsShortcutHandler(navigation);

  return (
    <View navigation={<TagsShortcuts onShortcut={onShortcut} />}>
      {renderTags(tags)}
    </View>
  );
}
