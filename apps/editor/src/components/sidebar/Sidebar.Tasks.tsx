import { tasksNavaigation } from '../mock/mock.tasks';
import { Section } from '../Section';
import { View } from './Sidebar.View';
import { Navigation } from '../entry/Entry.Navigation';

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
              />
            );
          })}
        </Section>
      }
    ></View>
  );
}
