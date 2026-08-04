import { Fragment } from 'react';

// Components
import { Task } from '../sidebar/Task';
import { Section } from '@app/layouts/sidebar/section/Section';

// Models
import type { TaskOccurrence as TaskModel } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';

// Helpers
import { groupTasks } from './groupTasks';

interface RenderTasksByDateProps {
  readonly tasks: readonly TaskModel[];
  readonly workspace: Workspace;
}

const SECTIONS: ReadonlyArray<{
  readonly key: 'today' | 'upcoming';
  readonly title: string;
  readonly sectionId: string;
}> = [
  { key: 'today', title: 'Today', sectionId: 'tasks-today' },
  { key: 'upcoming', title: 'Upcoming', sectionId: 'tasks-upcoming' },
];

export function renderTasksByDate({ tasks, workspace }: RenderTasksByDateProps) {
  const taskGroups = groupTasks(tasks);

  return SECTIONS.map(({ key, title, sectionId }) => {
    const tasksInGroup = taskGroups[key];

    return (
      <Fragment key={sectionId}>
        <Section
          hasHeader
          title={title}
          isCollapsible
          isExpanded={workspace.isSectionExpanded(sectionId)}
          onExpandedChange={() => workspace.toggleSectionExpanded(sectionId)}
        >
          {tasksInGroup.map((task) => (
            <Task
              key={task.text}
              title={task.text}
              // TODO: Wire real due-date metadata once the vault Task model
              // exposes one (see groupTasks.ts) — omitted rather than
              // fabricated.
              isChecked={task.completed}
              onClick={() => {}}
            />
          ))}
        </Section>
      </Fragment>
    );
  });
}
