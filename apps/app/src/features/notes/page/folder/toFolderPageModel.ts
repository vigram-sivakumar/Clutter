import type { Folder } from '@core/vault/models';
import type { Vault } from '@core/vault/models';
import type { FolderPageActions, FolderPageModel } from './FolderPageModel';
import { buildBreadcrumbs } from '@app/layouts/page/topbar/buildBreadcrumbs';
import { getChildFolders } from '@features/notes/helpers/getChildFolders';
import { getChildPages } from '@features/notes/helpers/getChildPages';
import { toFolderChildItem } from './FolderChildren';

export function toFolderPageModel(
  folder: Folder,
  vault: Vault,
  actions: FolderPageActions
): FolderPageModel {
  const childFolders = getChildFolders(
    [...vault.folders()],
    folder.id
  ).map((child) => toFolderChildItem(child, actions));

  const childPages = getChildPages([...vault.pages()], folder.id).map(
    (child) => toFolderChildItem(child, actions)
  );

  return {
    title: folder.name,
    description: folder.metadata.description,
    coverImage: folder.metadata.cover,
    breadcrumbs: buildBreadcrumbs(folder, vault, actions.onOpenFolder),
    children: [...childFolders, ...childPages],
  };
}
