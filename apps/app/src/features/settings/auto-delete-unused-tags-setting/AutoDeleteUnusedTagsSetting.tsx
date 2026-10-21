import { useSyncExternalStore } from 'react';
import { Switch } from '@components/switch/Switch';
import { DEFAULT_SPACE_SETTINGS, type SpaceSettingsSource } from '../space-settings/SpaceSettingsSource';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

const noopSubscribe = () => () => {};

/** Whether this Space removes tags that no note uses any more. Per Space, and off until turned on. */
export function AutoDeleteUnusedTagsSetting({ source }: { source?: SpaceSettingsSource }) {
  const enabled = useSyncExternalStore(
    source?.subscribe ?? noopSubscribe,
    () => source?.getAutoDeleteUnusedTags() ?? DEFAULT_SPACE_SETTINGS.autoDeleteUnusedTags
  );

  return (
    <SettingsEntry
      title="Automatically delete unused tags"
      description="Remove tags that are no longer used by any notes"
      trailing={
        <Switch
          aria-label="Automatically delete unused tags"
          isChecked={enabled}
          onCheckedChange={(checked) => source?.setAutoDeleteUnusedTags(checked)}
        />
      }
    />
  );
}
