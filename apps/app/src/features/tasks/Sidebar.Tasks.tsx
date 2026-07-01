import { tasksNavaigation } from '../../mock/mock.tasks';
import { Section } from '@components/sidebar/section/Sidebar.Section';
import { View } from '@components/sidebar/View/Sidebar.View';
import { Navigation } from '@components/sidebar/Entry.Navigation';

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
    ></View>
  );
}
