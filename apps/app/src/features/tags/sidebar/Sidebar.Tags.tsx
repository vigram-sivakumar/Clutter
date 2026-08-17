import { useState } from 'react';

import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { TagOperations } from '@core/application/tags/TagOperations';
import { buildTagsShortcutHandler } from '@features/tags/shortcuts/buildTagsShortcutHandler';
import { TagsShortcuts } from '@features/tags/shortcuts/TagsShortcuts';
import { renderTags } from '../helpers/renderTags';
import type { Vault } from '@core/vault/models';

interface TagsPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
  readonly tagOperations: TagOperations;
}

export function Tags({ vault, navigation, tagOperations }: TagsPanelProps) {
  const tags = [...vault.tags()];
  const onShortcut = buildTagsShortcutHandler(navigation);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <View navigation={<TagsShortcuts onShortcut={onShortcut} />}>
      {renderTags(tags, {
        onOpenTag: (name) => navigation.openTag(name),
        rowActions: {
          openMenuId,
          onOpenMenu: (name) => setOpenMenuId(name),
          onCloseMenu: () => setOpenMenuId(null),
          onChangeTagIcon: (name, emoji) =>
            void tagOperations.updateMetadata(
              name,
              emoji === null ? { icon: undefined } : { icon: emoji }
            ),
        },
      })}
    </View>
  );
}
