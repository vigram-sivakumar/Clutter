import type { Application } from '@core/application/Application';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import { buildResourceContextMenu } from '../topbar/buildTopBarActions';
import { buildResourceMenuOptions, type ResourceMenuOps } from '../topbar/buildResourceMenuOptions';
import type { ResourceTopBarActionsProps } from '../topbar/ResourceTopBarActions';

/**
 * The right-click menu for one Collection View entry: that entry's resource's topbar menu — same
 * definitions, options and handlers (`buildResourceMenuOptions` + `buildResourceContextMenu`) — only
 * anchored at the pointer. The target is resolved from the entry itself (a Tag collection's
 * matching-line entry acts on its source note), looked up live in the vault, so the menu always reflects
 * the item's current state (favorite, archived) and `null` for one that is gone or not yet saved.
 */
export function buildCollectionItemMenu(
  application: Application,
  ops: ResourceMenuOps,
  entry: CollectionEntryModel
): ResourceTopBarActionsProps | null {
  const id = entry.noteId ?? entry.id;
  const resource =
    entry.type === 'folder' ? application.vault.getFolder(id) : application.vault.getPage(id);

  return resource ? buildResourceContextMenu(resource, buildResourceMenuOptions(application, resource, ops)) : null;
}
