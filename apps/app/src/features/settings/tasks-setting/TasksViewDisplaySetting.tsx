import { useSyncExternalStore } from 'react';
import { Switch } from '@components/switch/Switch';
import type { PersistedTasksViewConfig } from '@core/application/task/TasksViewConfigStore';
import {
  DEFAULT_TASK_DISPLAY_CONFIG,
  HIDEABLE_TASK_GROUP_IDS,
  type TaskGroupId,
} from '@features/tasks/helpers/groupTasks';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export interface TasksViewConfigSource {
  get(): PersistedTasksViewConfig;
  update(patch: Partial<PersistedTasksViewConfig>): void;
  subscribe(listener: () => void): () => void;
}

const GROUP_LABELS: Record<TaskGroupId, string> = {
  today: 'Today',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  unscheduled: 'Unscheduled',
};

export function TasksViewDisplaySetting({ source }: { readonly source?: TasksViewConfigSource }) {
  if (!source) return null;
  return <TasksViewDisplaySettingContent source={source} />;
}

function TasksViewDisplaySettingContent({ source }: { readonly source: TasksViewConfigSource }) {
  const persisted = useSyncExternalStore(source.subscribe, source.get, source.get);
  const showCompleted = persisted.showCompleted ?? DEFAULT_TASK_DISPLAY_CONFIG.showCompleted;
  const autoSortCompleted = persisted.autoSortCompleted ?? DEFAULT_TASK_DISPLAY_CONFIG.autoSortCompleted;
  const hiddenGroups = persisted.hiddenGroups ?? DEFAULT_TASK_DISPLAY_CONFIG.hiddenGroups ?? [];

  return (
    <>
      <SettingsEntry
        title="Show completed"
        description="Show completed tasks in the Tasks sidebar and task views"
        trailing={
          <Switch
            aria-label="Show completed"
            isChecked={showCompleted}
            onCheckedChange={(enabled) => source.update({ showCompleted: enabled })}
          />
        }
      />
      <SettingsEntry
        title="Sort completed"
        description="Move completed tasks below active tasks"
        trailing={
          <Switch
            aria-label="Sort completed"
            isChecked={autoSortCompleted}
            disabled={!showCompleted}
            onCheckedChange={(enabled) => source.update({ autoSortCompleted: enabled })}
          />
        }
      />
      {HIDEABLE_TASK_GROUP_IDS.map((id) => {
        const isShown = !hiddenGroups.includes(id);
        const label = GROUP_LABELS[id];
        return (
          <SettingsEntry
            key={id}
            title={label}
            description={`Show the ${label} section in the Tasks sidebar`}
            trailing={
              <Switch
                aria-label={`Show ${label} section`}
                isChecked={isShown}
                onCheckedChange={(enabled) =>
                  source.update({
                    hiddenGroups: enabled
                      ? hiddenGroups.filter((hidden) => hidden !== id)
                      : [...hiddenGroups, id],
                  })
                }
              />
            }
          />
        );
      })}
    </>
  );
}
