import type { Application } from '@core/application/Application';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { SettingsDialog } from '@app/layouts/sidebar/footer/SettingsDialog';
import { useSettingsSources } from '@app/layouts/sidebar/useSettingsSources';
import { useSpaces } from './spaces/SpacesContext';
import { describeRenameRefusal } from './spaces/renameActiveSpace';

interface ActiveSpaceSettingsDialogProps {
  /** The open Space's Application, or `null` while the old one is closed and the next is not open yet. */
  application: Application | null;
  /** The Space is changing under the dialog (a rename is running): its own controls are disabled. */
  busy?: boolean;
}

/**
 * The Settings dialog, wired to whichever Space is open. It is the one persistent shell: it is rendered outside the
 * frames that come and go as a Space closes and another opens, so it stays mounted and visible through a rename.
 *
 * What it shows about the Spaces (the list, which is open, its name) comes from the registry, which is always there.
 * What it reads FROM a Space (templates, note location, the Space's settings) comes from the Application — and
 * while there is none, nothing is read: the dialog never reaches into a closed Application. The Space's own controls
 * are disabled for that time (`busy`), and it reconnects to the next Application as soon as one is open.
 */
export function ActiveSpaceSettingsDialog({ application, busy = false }: ActiveSpaceSettingsDialogProps) {
  const spaces = useSpaces();
  const sources = useSettingsSources(application);
  const activePath = spaces?.activePath ?? '';

  return (
    <SettingsDialog
      vaultFolderName={VaultPath.filename(activePath)}
      spaces={spaces?.spaces}
      activeSpacePath={activePath}
      busy={busy}
      onRemoveSpace={spaces?.onRemoveSpace}
      onRenameActiveSpace={
        spaces?.onRenameActiveSpace &&
        (async (newName) => {
          const outcome = await spaces.onRenameActiveSpace!(newName);
          // Only a refusal is shown here (nothing was closed, so this page is still open). Every other outcome is
          // reported by the shell, because the Application this page belongs to has been replaced.
          return outcome.status === 'refused' ? { error: describeRenameRefusal(outcome.reason) } : {};
        })
      }
      onRenameInactiveSpace={
        spaces?.onRenameInactiveSpace &&
        (async (path, newName) => {
          const outcome = await spaces.onRenameInactiveSpace!(path, newName);
          // This page is still open after every outcome (the open Space was never touched), so it shows what went wrong.
          if (outcome.status === 'refused') return { error: describeRenameRefusal(outcome.reason) };
          if (outcome.status === 'failed') return { error: outcome.message };
          return {};
        })
      }
      onChangeActiveSpaceAvatar={spaces?.onChangeActiveSpaceAvatar}
      resolveImageUrl={
        spaces?.resolveAvatarImageUrl ?? (application ? (src) => application.resolveCoverImageForDisplay(src) : undefined)
      }
      {...sources}
    />
  );
}
