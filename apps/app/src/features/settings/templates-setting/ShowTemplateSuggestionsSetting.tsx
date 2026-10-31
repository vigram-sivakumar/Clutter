import { Switch } from '@components/switch/Switch';
import {
  useShowTemplateSuggestions,
  writeShowTemplateSuggestions,
} from '@shared/helpers/showTemplateSuggestionsPreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function ShowTemplateSuggestionsSetting() {
  const show = useShowTemplateSuggestions();

  return (
    <SettingsEntry
      title="Show template suggestions"
      description="Show template suggestions when creating a new note"
      trailing={
        <Switch
          aria-label="Show template suggestions"
          isChecked={show}
          onCheckedChange={writeShowTemplateSuggestions}
        />
      }
    />
  );
}
