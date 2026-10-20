import { Switch } from '@components/switch/Switch';
import { useShowAssetsInFolders, writeShowAssetsInFolders } from '@shared/helpers/showAssetsInFoldersPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function ShowAssetsInFoldersSetting() {
  const show = useShowAssetsInFolders();

  return (
    <SettingsEntry
      title="Show assets in folders"
      description="Show asset files alongside notes in regular folders"
      trailing={
        <Switch
          aria-label="Show assets in folders"
          isChecked={show}
          onCheckedChange={writeShowAssetsInFolders}
        />
      }
    />
  );
}
