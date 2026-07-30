import type { ReactNode } from 'react';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';

import { renderTopBarActions } from './topBarRegistry';

function isPage(entry: Page | Folder): entry is Page {
  return 'type' in entry;
}

function getResourceType(resource: Page | Folder): Page['type'] | 'folder' {
  return isPage(resource) ? resource.type : 'folder';
}

export interface TopBarParts {
  actions: ReactNode;
}

/**
 * Builds trailing top bar actions for the currently active resource.
 */
export function buildTopBarActions(
  resource: Page | Folder,
  onArchive?: () => void
): TopBarParts {
  const resourceType = getResourceType(resource);

  return {
    actions: renderTopBarActions(resourceType, { onArchive }),
  };
}
