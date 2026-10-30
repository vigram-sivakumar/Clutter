import { Switch } from '@components/switch/Switch';
import { useMarkdownItalicFont, writeMarkdownItalicFont } from '@shared/helpers/markdownItalicFontPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function MarkdownItalicFontSetting() {
  const enabled = useMarkdownItalicFont();

  return (
    <SettingsEntry
      title="Italic font"
      description="Use a distinct font for italic text in your notes"
      trailing={
        <Switch aria-label="Italic font" isChecked={enabled} onCheckedChange={writeMarkdownItalicFont} />
      }
    />
  );
}
