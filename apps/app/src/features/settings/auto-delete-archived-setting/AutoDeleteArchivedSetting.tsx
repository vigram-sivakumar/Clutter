import { useSyncExternalStore } from 'react';
import { Switch } from '@components/switch/Switch';
import { DEFAULT_SPACE_SETTINGS, type SpaceSettingsSource } from '../space-settings/SpaceSettingsSource';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

const noopSubscribe = () => () => {};

export function AutoDeleteArchivedSetting({ source }: { source?: SpaceSettingsSource }) {
  const enabled = useSyncExternalStore(
    source?.subscribe ?? noopSubscribe,
    () => source?.getAutoDeleteArchived() ?? DEFAULT_SPACE_SETTINGS.autoDeleteArchived
  );

  return (
    <SettingsEntry
      title="Automatically delete archived items"
      description="Permanently delete archived items after 30 days"
      trailing={
        <Switch
          aria-label="Automatically delete archived items"
          isChecked={enabled}
          onCheckedChange={(checked) => source?.setAutoDeleteArchived(checked)}
        />
      }
    />
  );
}
