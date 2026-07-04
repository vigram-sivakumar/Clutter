import { isExpanded } from './isExpanded';

export function toggleExpanded(expandedFolderIds: string[], folderId: string) {
  if (isExpanded(expandedFolderIds, folderId)) {
    return expandedFolderIds.filter((id) => id !== folderId);
  }
  return [...expandedFolderIds, folderId];
}
