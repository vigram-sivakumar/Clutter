import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { NoteLocationOption } from '@features/settings/default-note-location-setting/DefaultNoteLocationSetting';
import { buildMoveDestinationItems } from './buildMoveDestinationItems';

/**
 * The folders the Default note location setting offers: the list a Move picker offers for a note — every
 * folder the sidebar's tree can show, nested ones listed after their parents, never archived, hidden or
 * reserved ones — without Inbox (the default, which the setting lists first itself) and without Templates (a
 * note created there is a template, a different thing). Each carries its ancestors' names, so same-named
 * folders in different places can be told apart.
 */
export function buildNoteLocationFolders(membershipSelector: MembershipSelector): NoteLocationOption[] {
  return buildMoveDestinationItems(membershipSelector, undefined, 'workspace', {
    includeTemplates: false,
    includeInbox: false,
  }).map((item) => ({
    id: item.id,
    title: item.title,
    parentPath: (item.ancestors ?? []).map((ancestor) => ancestor.title).join(' / '),
    emoji: item.emoji,
  }));
}
