import { Switch } from '@components/switch/Switch';
import { useApplyTemplateCover, writeApplyTemplateCover } from '@shared/helpers/applyTemplateCoverPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function ApplyTemplateCoverSetting() {
  const apply = useApplyTemplateCover();

  return (
    <SettingsEntry
      title="Apply template cover image"
      description="Add the template’s cover image when you choose a template suggestion"
      trailing={<Switch aria-label="Apply template cover image" isChecked={apply} onCheckedChange={writeApplyTemplateCover} />}
    />
  );
}
