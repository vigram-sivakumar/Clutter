import { Switch } from '@components/switch/Switch';
import {
  usePreferClutterQuoteSyntax,
  writePreferClutterQuoteSyntax,
} from '@shared/helpers/preferClutterQuoteSyntaxPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function PreferClutterQuoteSyntaxSetting() {
  const enabled = usePreferClutterQuoteSyntax();

  return (
    <SettingsEntry
      title="Prefer Clutter quote syntax"
      description="Automatically convert standard Markdown blockquote markers to Clutter’s native quote syntax when typing"
      trailing={
        <Switch
          aria-label="Prefer Clutter quote syntax"
          isChecked={enabled}
          onCheckedChange={writePreferClutterQuoteSyntax}
        />
      }
    />
  );
}
