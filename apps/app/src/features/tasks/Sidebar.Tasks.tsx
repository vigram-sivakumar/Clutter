import { tasksNavaigation } from '../../mock/mock.tasks';
import { Section } from '@components/sidebar/section/Sidebar.Section';
import { View } from '@components/sidebar/View/Sidebar.View';
import { Navigation } from '@components/sidebar/navigation/Navigation';
// Helpers
import { renderTasksByDate } from './helpers/renderTasksByDate';
// Mock
import { tasks } from './mock/Mock.Tasks';
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
