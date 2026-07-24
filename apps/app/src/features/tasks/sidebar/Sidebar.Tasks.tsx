import type { Vault } from '@core/vault/models';
import { tasksNavigation } from '../mock/taskNavigation';
import { Section } from '@app/layouts/sidebar/section/Section';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
// Helpers
import { renderTasksByDate } from '../helpers/renderTasksByDate';
// import { renderCompletedTasks } from './helpers/renderCompletedTasks';
import { AppIcon } from '@shared/icon';

interface TasksPanelProps {
  readonly vault: Vault;
}

export function Tasks({ vault }: TasksPanelProps) {
  const tasks = [...vault.tasks()];
  return (
    <View
      navigation={
        <Section>
          {tasksNavigation.map((navigation) => {
            return (
              <Navigation
                key={navigation.id}
                title={navigation.title}
                leading={
                  <AppIcon icon={navigation.icon} emoji={navigation.emoji} />
                }
                onClick={() => {}}
              />
            );
          })}
        </Section>
      }
    >
      {renderTasksByDate({ tasks })}
      {/* {renderCompletedTasks({ tasks })} */}
    </View>
  );
}
