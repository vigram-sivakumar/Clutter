// import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { Section } from '@app/layouts/sidebar/section/Section';
import { renderTags } from './helpers/renderTags';
import { tags as tagsMock } from './mock/tags';
import { tagsNavigation } from './mock/tagsNavigation';

export function TagsPanel() {
  // const [isAllTagsExpanded, setAllTagsExpanded] = useState(true);

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
      {/* <Section
        // hasHeader
        title="All tags"
        isExpanded={isAllTagsExpanded}
        onExpandedChange={setAllTagsExpanded}
        onClick={() => {}}
      > */}
      {renderTags(tagsMock)}
      {/* </Section> */}
    </View>
  );
}
