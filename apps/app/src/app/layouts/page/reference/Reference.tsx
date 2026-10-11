import { useState } from 'react';
import type { ReactNode } from 'react';

import { Header } from '@app/layouts/sidebar/section/Section.Header';
import './Reference.css';

interface ReferencesProps {
  tasks?: ReactNode;
  notes?: ReactNode;
  dailyNotes?: ReactNode;
}

type GroupKey = 'tasks' | 'notes' | 'daily-notes';

/** In display order. A group with nothing to show is passed as null and is not rendered. */
const GROUP_TITLES: readonly { readonly key: GroupKey; readonly title: string }[] = [
  { key: 'tasks', title: 'Tasks' },
  { key: 'notes', title: 'Notes' },
  { key: 'daily-notes', title: 'Daily notes' },
];

/**
 * One References section with up to three groups. The section and each group collapse on their own; which
 * groups exist is the caller's decision (an empty one is simply not passed).
 */
export function References({ tasks, notes, dailyNotes }: ReferencesProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<GroupKey>>(new Set());

  const content: Record<GroupKey, ReactNode> = {
    tasks,
    notes,
    'daily-notes': dailyNotes,
  };
  const groups = GROUP_TITLES.filter((group) => content[group.key] != null);

  if (groups.length === 0) {
    return null;
  }

  const toggleGroup = (key: GroupKey): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current);

      if (!next.delete(key)) {
        next.add(key);
      }

      return next;
    });
  };

  return (
    <section className="reference">
      <Header
        interaction="subtle"
        title="References"
        isCollapsible
        isTitleToggle
        isExpanded={isExpanded}
        onExpandToggle={() => setIsExpanded((expanded) => !expanded)}
      />

      {isExpanded && (
        <div className="reference__content">
          {groups.map((group, index) => {
            const isGroupExpanded = !collapsedGroups.has(group.key);

            return (
              <div key={group.key} className="reference__group">
                {index > 0 && <span className="reference__divider" />}

                <Header
                  interaction="subtle"
                  title={group.title}
                  isCollapsible
                  isTitleToggle
                  isExpanded={isGroupExpanded}
                  onExpandToggle={() => toggleGroup(group.key)}
                />

                {isGroupExpanded && <div className="reference__list">{content[group.key]}</div>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
