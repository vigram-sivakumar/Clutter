import type { Folder } from '@core/vault/models';
import type { Vault } from '@core/vault/models';
import type { FolderPageActions, FolderPageModel } from './FolderPageModel';
import { buildBreadcrumbs } from '@app/layouts/page/topbar/buildBreadcrumbs';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { toFolderChildItem } from './FolderChildren';

export function toFolderPageModel(
  folder: Folder,
  vault: Vault,
  actions: FolderPageActions
): FolderPageModel {
  const query = new VaultQuery(vault);

  const childFolders = query
    .getChildFolders(folder.id)
    .map((child) => toFolderChildItem(child, actions));

  const childPages = query
    .getChildPages(folder.id)
    .map((child) => toFolderChildItem(child, actions));

  return {
    title: folder.name,
    description: folder.metadata.description,
    coverImage: folder.metadata.cover,
    breadcrumbs: buildBreadcrumbs(folder, vault, actions.onOpenFolder),
    children: [...childFolders, ...childPages],
  };
}
