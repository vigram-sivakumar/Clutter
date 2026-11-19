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

function useTasksViewConfig(source: TasksViewConfigSource) {
  return useSyncExternalStore(source.subscribe, source.get, source.get);
}

export function ShowCompletedSetting({ source }: { readonly source?: TasksViewConfigSource }) {
  if (!source) return null;
  return <ShowCompletedSettingContent source={source} />;
}

function ShowCompletedSettingContent({ source }: { readonly source: TasksViewConfigSource }) {
  const persisted = useTasksViewConfig(source);
  const showCompleted = persisted.showCompleted ?? DEFAULT_TASK_DISPLAY_CONFIG.showCompleted;

  return (
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
  );
}

export function AutoSortCompletedSetting({ source }: { readonly source?: TasksViewConfigSource }) {
  if (!source) return null;
  return <AutoSortCompletedSettingContent source={source} />;
}

function AutoSortCompletedSettingContent({ source }: { readonly source: TasksViewConfigSource }) {
  const persisted = useTasksViewConfig(source);
  const autoSortCompleted = persisted.autoSortCompleted ?? DEFAULT_TASK_DISPLAY_CONFIG.autoSortCompleted;

  return (
    <SettingsEntry
      title="Auto-sort completed"
      description="Move completed tasks below active tasks"
      trailing={
        <Switch
          aria-label="Auto-sort completed"
          isChecked={autoSortCompleted}
          onCheckedChange={(enabled) => source.update({ autoSortCompleted: enabled })}
        />
      }
    />
  );
}
