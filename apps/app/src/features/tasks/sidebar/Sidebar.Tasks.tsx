import { tasksNavaigation } from '../mock/taskNavigation';
import { Section } from '@app/layouts/sidebar/section/Section';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
// Helpers
import { renderTasksByDate } from '../helpers/renderTasksByDate';
// Mock
import { tasks } from '../mock/tasks';
// import { renderCompletedTasks } from './helpers/renderCompletedTasks';

export function TasksPanel() {
  return (
    <View
      navigation={
        <Section>
          {tasksNavaigation.map((navigation) => {
            const Icon = navigation.icon;
            return (
              <Navigation
                key={navigation.id}
                title={navigation.title}
                leading={<Icon />}
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
