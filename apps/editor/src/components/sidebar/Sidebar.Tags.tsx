import { useState } from 'react';
import { View } from './Sidebar.View';
import { Navigation } from '../entry/Entry.Navigation';
import { Section } from '../Section';
import { tagsData, tagsNavigation } from '../mock/mock.tags';
import { Tag } from '../entry/Entry.Tag';

export function TagsPanel() {
  const [isAllTagsExpanded, setAllTagsExpanded] = useState(true);

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
                onClick={() => {}}
              />
            );
          })}
        </Section>
      }
    >
      <Section
        // hasHeader
        title="All tags"
        isExpanded={isAllTagsExpanded}
        onExpandedChange={setAllTagsExpanded}
        onClick={() => {}}
      >
        {tagsData.map((tag) => {
          return (
            <Tag
              key={tag.id}
              title={tag.title}
              color={tag.color}
              count={tag.count}
              onClick={() => {}}
            />
          );
        })}
      </Section>
    </View>
  );
}
