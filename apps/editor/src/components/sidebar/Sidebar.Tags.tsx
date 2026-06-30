import { View } from './Sidebar.View';
import { Navigation } from '../entry/Entry.Navigation';
import { Section } from '../Section';
import { tagsNavigation } from '../mock/mock.tags';

export function TagsPanel() {
  return (
    <View
      navigation={
        <Section>
          {tagsNavigation.map((navigation) => {
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
