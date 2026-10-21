import { useSyncExternalStore } from 'react';
import { Switch } from '@components/switch/Switch';
import { DEFAULT_SPACE_SETTINGS, type SpaceSettingsSource } from '../space-settings/SpaceSettingsSource';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

const noopSubscribe = () => () => {};

/** Whether this Space lets assets and asset folders be moved into its ordinary folders. Per Space, and off until turned on. */
export function AllowMovingAssetsSetting({ source }: { source?: SpaceSettingsSource }) {
  const enabled = useSyncExternalStore(
    source?.subscribe ?? noopSubscribe,
    () => source?.getAllowMovingAssetsToFolders() ?? DEFAULT_SPACE_SETTINGS.allowMovingAssetsToFolders
  );

  return (
    <SettingsEntry
      title="Allow moving assets to folders"
      description="Allow assets and asset folders to be moved into regular folders in your Space"
      trailing={
        <Switch
          aria-label="Allow moving assets to folders"
          isChecked={enabled}
          onCheckedChange={(checked) => source?.setAllowMovingAssetsToFolders(checked)}
        />
      }
    />
  );
}
