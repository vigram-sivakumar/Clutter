import { Switch } from '@components/switch/Switch';
import { usePreserveBulletStyle, writePreserveBulletStyle } from '@shared/helpers/preserveBulletStylePreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function PreserveBulletStyleSetting() {
  const preserve = usePreserveBulletStyle();

  return (
    <SettingsEntry
      title="Preserve bullet style"
      description="Show the original Markdown bullet marker. Turn off to always display dots."
      trailing={
        <Switch aria-label="Preserve bullet style" isChecked={preserve} onCheckedChange={writePreserveBulletStyle} />
      }
    />
  );
}
