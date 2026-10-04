import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { ROOT_DESTINATION_ID, type FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { getPageIcon } from '@core/presentation/getPageIcon';

import { buildMoveDestinationItems } from './buildMoveDestinationItems';

/**
 * The folder list for "pick where this cover image goes": every folder the sidebar's tree shows
 * (reserved, archived and hidden ones are already excluded — it walks the same folders as the
 * Move picker), flattened into one alphabetical "Folders" section with no tree. A nested
 * folder keeps its parent chain as `ancestors`, so the picker can show where it lives. The
 * vault root is not offered.
 */
export function buildCoverFolderItems(membershipSelector: MembershipSelector): FolderPickerItem[] {
  return buildMoveDestinationItems(membershipSelector)
    .filter((item) => item.id !== ROOT_DESTINATION_ID)
    .map((item) => ({
      ...item,
      level: 0,
      parentId: null,
      icon: getPageIcon('folder'),
      section: 'Folders',
    }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}
