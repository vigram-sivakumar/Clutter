import { Switch } from '@components/switch/Switch';
import { useShowTagEmojis, writeShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function ShowTagEmojisSetting() {
  const show = useShowTagEmojis();

  return (
    <SettingsEntry
      title="Show tag emojis"
      description="Show tag emojis in the editor and its Tags property."
      trailing={<Switch aria-label="Show tag emojis" isChecked={show} onCheckedChange={writeShowTagEmojis} />}
    />
  );
}
