import { useSyncExternalStore } from 'react';
import { Switch } from '@components/switch/Switch';
import type { PersistedTasksViewConfig } from '@core/application/task/TasksViewConfigStore';
import { DEFAULT_TASK_DISPLAY_CONFIG } from '@features/tasks/helpers/groupTasks';
import { SettingsEntry } from '../settings-entry/SettingsEntry';

export interface TasksViewConfigSource {
  get(): PersistedTasksViewConfig;
  update(patch: Partial<PersistedTasksViewConfig>): void;
  subscribe(listener: () => void): () => void;
}

export function TasksViewDisplaySetting({ source }: { readonly source?: TasksViewConfigSource }) {
  if (!source) return null;
  return <TasksViewDisplaySettingContent source={source} />;
}

function TasksViewDisplaySettingContent({ source }: { readonly source: TasksViewConfigSource }) {
  const persisted = useSyncExternalStore(source.subscribe, source.get, source.get);
  const showCompleted = persisted.showCompleted ?? DEFAULT_TASK_DISPLAY_CONFIG.showCompleted;
  const autoSortCompleted = persisted.autoSortCompleted ?? DEFAULT_TASK_DISPLAY_CONFIG.autoSortCompleted;

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
        title="Auto-sort completed"
        description="Move completed tasks below active tasks"
        trailing={
          <Switch
            aria-label="Auto-sort completed"
            isChecked={autoSortCompleted}
            disabled={!showCompleted}
            onCheckedChange={(enabled) => source.update({ autoSortCompleted: enabled })}
          />
        }
      />
    </>
  );
}
