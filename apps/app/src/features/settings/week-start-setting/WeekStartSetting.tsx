import { Switch } from '@components/switch/Switch';
import {
  useWeekStart,
  writeWeekStart,
} from '@features/daily-notes/calendar/weekStart';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export function WeekStartSetting() {
  const weekStart = useWeekStart();

  return (
    <SettingsEntry
      title="Start week on Monday"
      description="Display Monday as the first day of the week"
      trailing={
        <Switch
          aria-label="Start week on Monday"
          isChecked={weekStart === 'monday'}
          onCheckedChange={(checked) =>
            writeWeekStart(checked ? 'monday' : 'sunday')
          }
        />
      }
    />
  );
}
