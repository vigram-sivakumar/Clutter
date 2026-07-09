import { tasksNavigation } from '../mock/taskNavigation';
import { Section } from '@app/layouts/sidebar/section/Section';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
// Helpers
import { renderTasksByDate } from '../helpers/renderTasksByDate';
// Mock
import { tasks } from '../mock/tasks';
// import { renderCompletedTasks } from './helpers/renderCompletedTasks';
import { AppIcon } from '@shared/icon';

export function TasksPanel() {
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
