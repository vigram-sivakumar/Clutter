import type { Vault } from '@core/vault/models';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { TasksNavigation } from '@features/tasks/navigation/TasksNavigation';
import { renderTasksByDate } from '../helpers/renderTasksByDate';

interface TasksPanelProps {
  readonly vault: Vault;
}

export function Tasks({ vault }: TasksPanelProps) {
  const tasks = [...vault.tasks()];

  return (
    <View navigation={<TasksNavigation />}>
      {renderTasksByDate({ tasks })}
    </View>
  );
}
