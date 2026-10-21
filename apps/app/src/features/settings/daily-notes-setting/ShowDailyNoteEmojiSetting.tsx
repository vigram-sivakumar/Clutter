import { Switch } from '@components/switch/Switch';
import { useShowDailyNoteEmoji, writeShowDailyNoteEmoji } from '@shared/helpers/showDailyNoteEmojiPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function ShowDailyNoteEmojiSetting() {
  const show = useShowDailyNoteEmoji();

  return (
    <SettingsEntry
      title="Show emoji"
      description="Show daily note emojis in the sidebar"
      trailing={<Switch aria-label="Show emoji" isChecked={show} onCheckedChange={writeShowDailyNoteEmoji} />}
    />
  );
}
