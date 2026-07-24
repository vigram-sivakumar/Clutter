// import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { Section } from '@app/layouts/sidebar/section/Section';
import { renderTags } from './helpers/renderTags';
import type { Vault } from '@core/vault/models';
import { tagsNavigation } from './mock/tagsNavigation';
import { AppIcon } from '@shared/icon';

interface TagsPanelProps {
  readonly vault: Vault;
}

export function Tags({ vault }: TagsPanelProps) {
  // const [isAllTagsExpanded, setAllTagsExpanded] = useState(true);
  const tags = [...vault.tags()];

  return (
    <View
      navigation={
        <Section>
          {tagsNavigation.map((navigation) => {
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
      {/* <Section
        // hasHeader
        title="All tags"
        isExpanded={isAllTagsExpanded}
        onExpandedChange={setAllTagsExpanded}
        onClick={() => {}}
      > */}
      {renderTags(tags)}
      {/* </Section> */}
    </View>
  );
}
