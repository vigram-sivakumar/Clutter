import { Switch } from '@components/switch/Switch';
import {
  useShowReferencesAutomatically,
  writeShowReferencesAutomatically,
} from '@shared/helpers/showReferencesAutomaticallyPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function ShowReferencesAutomaticallySetting() {
  const show = useShowReferencesAutomatically();

  return (
    <SettingsEntry
      title="Show references automatically"
      description="Automatically show references when a page has at least one reference."
      trailing={
        <Switch
          aria-label="Show references automatically"
          isChecked={show}
          onCheckedChange={writeShowReferencesAutomatically}
        />
      }
    />
  );
}
