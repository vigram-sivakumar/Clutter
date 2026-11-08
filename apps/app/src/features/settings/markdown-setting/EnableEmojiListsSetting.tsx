import { Switch } from '@components/switch/Switch';
import { useEnableEmojiLists, writeEnableEmojiLists } from '@shared/helpers/enableEmojiListsPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function EnableEmojiListsSetting() {
  const enabled = useEnableEmojiLists();

  return (
    <SettingsEntry
      title="Enable emoji lists"
      description="Treat emoji-prefixed lines as list items instead of regular paragraphs."
      trailing={<Switch aria-label="Enable emoji lists" isChecked={enabled} onCheckedChange={writeEnableEmojiLists} />}
    />
  );
}
