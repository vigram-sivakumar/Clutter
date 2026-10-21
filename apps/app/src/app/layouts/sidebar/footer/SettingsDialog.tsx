import { Dialog } from '@components/dialog/Dialog';
import { SpaceAvatar, type SpaceAvatarValue } from '@components/space-avatar/SpaceAvatar';
import { Settings } from '@features/settings/Settings';
import type { SettingsSpace } from '@features/settings/settings-sidebar/SettingsSidebar';
import { useSharedSettingsDialogState } from '@features/settings/SettingsDialogState';
import type { SpaceSettingsSource } from '@features/settings/space-settings/SpaceSettingsSource';
import type { NoteLocationSource } from '@features/settings/default-note-location-setting/DefaultNoteLocationSetting';
import type { TemplatesSource } from '@features/settings/preferred-templates/PreferredTemplates';
import { DEFAULT_SPACE_AVATAR, type ListedSpace } from './SpaceMenu';

interface SettingsDialogProps {
  vaultFolderName: string;
  spaceName?: string;
  avatar?: SpaceAvatarValue;
  resolveImageUrl?(src: string): string | null;
  spaces?: readonly ListedSpace[];
  activeSpacePath?: string;
  onRemoveSpace?(path: string): void;
  onRenameActiveSpace?(newName: string): Promise<{ error?: string }>;
  onRenameInactiveSpace?(path: string, newName: string): Promise<{ error?: string }>;
  onChangeActiveSpaceAvatar?: SettingsSpace['onChangeActiveSpaceAvatar'];
  /** The Space is changing under the dialog: no Application to read, and its own controls are disabled. */
  busy?: boolean;
  templates?: TemplatesSource;
  noteLocation?: NoteLocationSource;
  spaceSettings?: SpaceSettingsSource;
}

/**
 * The Settings dialog. It is rendered once, above the per-Space layout (which is remounted on every Space switch),
 * and opened through the shared SettingsDialogState — so switching Space from the dialog's own header swaps the
 * Space's values in place instead of closing and reopening it. Its Spaces section draws each Space with the same
 * avatar the sidebar footer's selector uses.
 */
export function SettingsDialog({
  vaultFolderName,
  spaceName,
  avatar = DEFAULT_SPACE_AVATAR,
  resolveImageUrl,
  spaces,
  activeSpacePath,
  onRemoveSpace,
  onRenameActiveSpace,
  onRenameInactiveSpace,
  onChangeActiveSpaceAvatar,
  busy,
  templates,
  noteLocation,
  spaceSettings,
}: SettingsDialogProps) {
  const state = useSharedSettingsDialogState();
  const title = spaceName || vaultFolderName;
  // As the footer does: each listed Space has its own avatar; the open one falls back to its entry's.
  const activeAvatar =
    avatar !== DEFAULT_SPACE_AVATAR
      ? avatar
      : (spaces?.find((space) => space.path === activeSpacePath)?.avatar ?? avatar);
  const avatarView = (
    <SpaceAvatar avatar={activeAvatar} folderName={vaultFolderName} resolveImageUrl={resolveImageUrl} />
  );

  if (!state) return null;

  return (
    <Dialog open={state.open} onClose={() => state.setOpen(false)} className="settings-dialog">
      <Settings
        templates={templates}
        noteLocation={noteLocation}
        spaceSettings={spaceSettings}
        space={{
          onRemoveSpace,
          onRenameActiveSpace,
          onRenameInactiveSpace,
          onChangeActiveSpaceAvatar,
          busy,
          spaces: (spaces ?? [{ path: activeSpacePath ?? '', name: title }]).map((space) => {
            const active = space.path === activeSpacePath || spaces === undefined;
            const listed = space as ListedSpace;
            return {
              path: space.path,
              name: active ? title : space.name,
              active,
              hasAvatar: active ? activeAvatar.type !== 'initial' : listed.avatar !== undefined && listed.avatar.type !== 'initial',
              avatar: active ? (
                avatarView
              ) : (
                <SpaceAvatar
                  avatar={listed.avatar ?? DEFAULT_SPACE_AVATAR}
                  folderName={space.name}
                  resolveImageUrl={resolveImageUrl}
                  badge={listed.missing ? 'error' : undefined}
                  badgeLabel={listed.missing ? 'Folder not found' : undefined}
                />
              ),
            };
          }),
        }}
        onClose={() => state.setOpen(false)}
      />
    </Dialog>
  );
}
