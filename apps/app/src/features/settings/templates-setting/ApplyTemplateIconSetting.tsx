import { Switch } from '@components/switch/Switch';
import { useApplyTemplateIcon, writeApplyTemplateIcon } from '@shared/helpers/applyTemplateIconPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function ApplyTemplateIconSetting() {
  const apply = useApplyTemplateIcon();

  return (
    <SettingsEntry
      title="Apply template icon"
      description="Add the template’s icon when you choose a template suggestion"
      trailing={<Switch aria-label="Apply template icon" isChecked={apply} onCheckedChange={writeApplyTemplateIcon} />}
    />
  );
}
