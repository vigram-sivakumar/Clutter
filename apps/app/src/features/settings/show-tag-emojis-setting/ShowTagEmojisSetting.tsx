import { Switch } from '@components/switch/Switch';
import { useShowTagEmojis, writeShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function ShowTagEmojisSetting() {
  const show = useShowTagEmojis();

  return (
    <SettingsEntry
      title="Show tag emojis"
      description="Display tag emojis in the editor and properties list"
      trailing={<Switch aria-label="Show tag emojis" isChecked={show} onCheckedChange={writeShowTagEmojis} />}
    />
  );
}
