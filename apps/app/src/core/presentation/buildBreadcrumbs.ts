import type { Vault } from '@core/vault/models/Vault';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';

import type { Breadcrumb } from './Breadcrumb';

function isPage(entry: Page | Folder): entry is Page {
  return 'type' in entry;
}

/**
 * Builds the breadcrumb trail for a page or folder.
 *
 * Every entry walks the same parent-folder chain; only the trailing
 * breadcrumb differs based on the entry type.
 */
function getEntryIcon(entry: Page | Folder) {
  if (!isPage(entry)) {
    return 'folder';
  }
  return entry.type === 'daily-note' ? 'calendarDot' : 'note';
}

export function buildBreadcrumbs(
  entry: Page | Folder,
  vault: Vault,
  onOpenFolder: (folderId: string) => void
): Breadcrumb[] {
  const ancestors: Breadcrumb[] = [];

  let folderId = entry.parentId;
  while (folderId) {
    const folder = vault.getFolder(folderId);

    if (!folder) {
      break;
    }

    ancestors.unshift({
      id: folder.id,
      title: folder.name,
      icon: 'folder',
      emoji: folder.metadata.icon ?? undefined,
      onClick: () => onOpenFolder(folder.id),
    });

    folderId = folder.parentId;
  }

  ancestors.push({
    id: entry.id,
    title: entry.name,
    icon: getEntryIcon(entry),
    emoji: entry.metadata.icon ?? undefined,
  });

  return ancestors;
}
