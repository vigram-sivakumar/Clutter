import { Switch } from '@components/switch/Switch';
import {
  useGroupTasksByDueDate,
  writeGroupTasksByDueDate,
} from '@shared/helpers/groupTasksByDueDatePreference';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function GroupTasksByDueDateSetting() {
  const group = useGroupTasksByDueDate();

  return (
    <SettingsEntry
      title="Group by due date"
      description="Group tasks by their due date"
      trailing={
        <Switch
          aria-label="Group by due date"
          isChecked={group}
          onCheckedChange={writeGroupTasksByDueDate}
        />
      }
    />
  );
}
