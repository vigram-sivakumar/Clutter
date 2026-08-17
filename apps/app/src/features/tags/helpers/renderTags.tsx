import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import { Tag } from '../sidebar/Tag';
import { buildTagSidebarMenu } from '../sidebar/tagSidebarMenu.config';
import { groupTagsByFavorite } from './groupTagsByFavorite';
import type { Tag as TagModel } from '@core/vault/models/Tag';

export interface TagRowActions {
  openMenuId: string | null;
  onOpenMenu(name: string): void;
  onCloseMenu(): void;
  onChangeTagIcon(name: string, emoji: string | null): void;
}

interface RenderTagsOptions {
  onOpenTag(name: string): void;
  rowActions?: TagRowActions;
}

function renderTagRow(
  tag: TagModel,
  isFavorite: boolean,
  onOpenTag: (name: string) => void,
  rowActions?: TagRowActions
) {
  const menuItems = rowActions ? buildTagSidebarMenu() : undefined;

  return (
    <Tag
      key={tag.name}
      title={tag.name}
      emoji={tag.icon}
      count={tag.usageCount}
      isFavorite={isFavorite}
      onClick={() => onOpenTag(tag.name)}
      menuItems={menuItems}
      menuOpen={rowActions?.openMenuId === tag.name}
      onMenuOpenChange={
        rowActions
          ? (open) => (open ? rowActions.onOpenMenu(tag.name) : rowActions.onCloseMenu())
          : undefined
      }
      onChangeIcon={
        rowActions
          ? (emoji) => rowActions.onChangeTagIcon(tag.name, emoji)
          : undefined
      }
    />
  );
}

export function renderTags(tags: readonly TagModel[], options: RenderTagsOptions) {
  const { favorites, others } = groupTagsByFavorite(tags);
  const { onOpenTag, rowActions } = options;

  return (
    <>
      <FavoritesSection isEmpty={favorites.length === 0} title="Favorites">
        {favorites.map((tag) => renderTagRow(tag, true, onOpenTag, rowActions))}
      </FavoritesSection>
      <Section hasHeader={favorites.length > 0} title="Others">
        {others.map((tag) => renderTagRow(tag, false, onOpenTag, rowActions))}
      </Section>
    </>
  );
}
