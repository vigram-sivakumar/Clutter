import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

/**
 * How many items a folder holds, as the Notes sidebar counts them: the subfolders and the notes it shows inside it (the
 * same two lists a folder row's own emptiness is decided by). Assets are not counted, even when the sidebar lists them. One
 * rule for every row that carries this count (a folder row, the Inbox shortcut).
 */
export function countFolderItems(membershipSelector: MembershipSelector, folderId: string): number {
  return (
    membershipSelector.getVisibleChildFolders(folderId).length +
    membershipSelector.getNotesChildPages(folderId).length
  );
}
