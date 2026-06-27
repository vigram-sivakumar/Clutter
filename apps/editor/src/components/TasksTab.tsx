import { Fragment, useState } from 'react';

import { Checkbox } from './Checkbox';
import { InteractiveItem } from './InteractiveItem';
import { SidebarHoverReveal } from './SidebarHoverReveal';
import { SubtaskCountBadge } from './SubtaskCountBadge';
import { Section, Group } from './section';
import { SidebarPanel } from './SidebarPanel';
import { Icons, type ClutterIcon } from '../design-system/icons';

type TasksNavId = 'all-tasks' | 'unplanned';
type TasksSectionId = 'today' | 'overdue' | 'upcoming';

type TasksDestination =
  | { kind: 'nav'; id: TasksNavId }
  | { kind: 'section'; id: TasksSectionId }
  | { kind: 'task'; id: string };

type NavItem = {
  id: TasksNavId;
  label: string;
  icon: ClutterIcon;
};

type TaskMock = {
  id: string;
  title: string;
  completed: boolean;
  scheduledDate: string;
  subtasks?: TaskMock[];
};

type TaskDateGroup = {
  subheader: string;
  tasks: TaskMock[];
};

const NAV_ITEMS: NavItem[] = [
  { id: 'all-tasks', label: 'All Tasks', icon: Icons.SquareCheckOutline },
  { id: 'unplanned', label: 'Unplanned', icon: Icons.Clock },
];

const TODAY_MOCK_TASKS: TaskMock[] = [
  {
    id: 'review-pr',
    title: 'Review PR',
    completed: false,
    scheduledDate: '2026-05-16',
  },
  {
    id: 'weekly-plan',
    title: 'Weekly planning',
    completed: false,
    scheduledDate: '2026-05-16',
    subtasks: [
      {
        id: 'weekly-plan-draft',
        title: 'Draft agenda',
        completed: false,
        scheduledDate: '2026-05-16',
        subtasks: [
          {
            id: 'weekly-plan-draft-goals',
            title: 'List team goals',
            completed: false,
            scheduledDate: '2026-05-16',
          },
          {
            id: 'weekly-plan-draft-blockers',
            title: 'Collect blockers',
            completed: false,
            scheduledDate: '2026-05-16',
          },
          {
            id: 'weekly-plan-draft-outline',
            title: 'Outline discussion topics',
            completed: true,
            scheduledDate: '2026-05-16',
          },
        ],
      },
      {
        id: 'weekly-plan-send',
        title: 'Send invites',
        completed: false,
        scheduledDate: '2026-05-16',
      },
    ],
  },
  {
    id: 'standup',
    title: 'Team standup',
    completed: false,
    scheduledDate: '2026-05-16',
  },
];

const OVERDUE_MOCK_GROUPS: TaskDateGroup[] = [
  {
    subheader: 'Yesterday',
    tasks: [
      {
        id: 'overdue-feedback',
        title: 'Reply to design feedback',
        completed: false,
        scheduledDate: '2026-05-15',
      },
      {
        id: 'overdue-expenses',
        title: 'Submit expense report',
        completed: false,
        scheduledDate: '2026-05-15',
      },
    ],
  },
  {
    subheader: 'May 12',
    tasks: [
      {
        id: 'overdue-dentist',
        title: 'Book dentist appointment',
        completed: true,
        scheduledDate: '2026-05-12',
      },
    ],
  },
];

const UPCOMING_MOCK_GROUPS: TaskDateGroup[] = [
  {
    subheader: 'Tomorrow',
    tasks: [
      {
        id: 'upcoming-slides',
        title: 'Prepare slide deck',
        completed: false,
        scheduledDate: '2026-05-17',
      },
    ],
  },
  {
    subheader: 'May 20',
    tasks: [
      {
        id: 'upcoming-review',
        title: 'Quarterly review',
        completed: false,
        scheduledDate: '2026-05-20',
      },
      {
        id: 'upcoming-launch',
        title: 'Launch checklist',
        completed: false,
        scheduledDate: '2026-05-20',
        subtasks: [
          {
            id: 'upcoming-launch-qa',
            title: 'QA sign-off',
            completed: false,
            scheduledDate: '2026-05-20',
          },
        ],
      },
    ],
  },
];

function flattenTasks(tasks: TaskMock[]): TaskMock[] {
  return tasks.flatMap((task) => [
    task,
    ...(task.subtasks ? flattenTasks(task.subtasks) : []),
  ]);
}

function flattenGroupTasks(groups: TaskDateGroup[]): TaskMock[] {
  return groups.flatMap((group) => flattenTasks(group.tasks));
}

function getTodaySectionDisplay(tasks: TaskMock[]) {
  const scheduled = flattenTasks(tasks);
  const scheduledCount = scheduled.length;

  if (scheduledCount === 0) {
    return {
      hasGroups: false,
      emptyMessage: 'No tasks for today',
    } as const;
  }

  const allCompleted = scheduled.every((task) => task.completed);

  if (allCompleted) {
    return {
      hasGroups: false,
      emptyMessage: 'All done for today',
    } as const;
  }

  return {
    hasGroups: true,
    emptyMessage: undefined,
  } as const;
}

function getScheduledSectionDisplay(
  groups: TaskDateGroup[],
  emptyMessage: string
) {
  if (flattenGroupTasks(groups).length === 0) {
    return {
      hasGroups: false,
      emptyMessage,
    } as const;
  }

  return {
    hasGroups: true,
    emptyMessage: undefined,
  } as const;
}

function updateTaskInTree(
  tasks: TaskMock[],
  taskId: string,
  updater: (task: TaskMock) => TaskMock
): TaskMock[] {
  return tasks.map((task) => {
    if (task.id === taskId) {
      return updater(task);
    }

    if (!task.subtasks) {
      return task;
    }

    return {
      ...task,
      subtasks: updateTaskInTree(task.subtasks, taskId, updater),
    };
  });
}

function updateTaskInGroups(
  groups: TaskDateGroup[],
  taskId: string,
  updater: (task: TaskMock) => TaskMock
): TaskDateGroup[] {
  return groups.map((group) => ({
    ...group,
    tasks: updateTaskInTree(group.tasks, taskId, updater),
  }));
}

type SubtaskProgress = {
  completed: number;
  total: number;
};

/**
 * Direct-subtask completion for parent task rows (`SubtaskCountBadge`).
 *
 * FUTURE: Prefer `subtaskCompletedCount` / `subtaskTotalCount` from the data layer
 * when subtasks are lazy-loaded — do not walk `subtasks` for totals the API has not sent.
 */
function getSubtaskProgress(task: TaskMock): SubtaskProgress | null {
  const subtasks = task.subtasks;
  if (!subtasks?.length) {
    return null;
  }

  return {
    completed: subtasks.filter((subtask) => subtask.completed).length,
    total: subtasks.length,
  };
}

type TaskSidebarRowProps = {
  task: TaskMock;
  depth?: number;
  destination: TasksDestination;
  expandedTaskIds: Record<string, boolean>;
  onSelectTask: (taskId: string) => void;
  onToggleTaskExpand: (taskId: string) => void;
  onToggleTaskCompleted: (taskId: string, completed: boolean) => void;
};

function TaskSidebarRow({
  task,
  depth = 0,
  destination,
  expandedTaskIds,
  onSelectTask,
  onToggleTaskExpand,
  onToggleTaskCompleted,
}: TaskSidebarRowProps) {
  const hasSubtasks = (task.subtasks?.length ?? 0) > 0;
  const isExpanded = expandedTaskIds[task.id] ?? false;
  const subtaskProgress = getSubtaskProgress(task);

  return (
    <Fragment>
      <InteractiveItem
        variant="default"
        indentDepth={depth}
        leadingMode={hasSubtasks ? 'caret' : 'slot'}
        hasChildren={hasSubtasks}
        isExpanded={isExpanded}
        onExpandToggle={
          hasSubtasks ? () => onToggleTaskExpand(task.id) : undefined
        }
        active={destination.kind === 'task' && destination.id === task.id}
        onClick={() => onSelectTask(task.id)}
        startSlot={
          <Checkbox
            checked={task.completed}
            onCheckedChange={(completed) =>
              onToggleTaskCompleted(task.id, completed)
            }
            aria-label={`Mark “${task.title}” complete`}
          />
        }
        endSlot={
          subtaskProgress ? (
            <SidebarHoverReveal>
              <SubtaskCountBadge
                completed={subtaskProgress.completed}
                total={subtaskProgress.total}
              />
            </SidebarHoverReveal>
          ) : undefined
        }
      >
        <span
          className={[
            'interactive-item__label',
            task.completed && 'interactive-item__label--completed',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {task.title}
        </span>
      </InteractiveItem>

      {hasSubtasks &&
        isExpanded &&
        task.subtasks?.map((subtask) => (
          <TaskSidebarRow
            key={subtask.id}
            task={subtask}
            depth={depth + 1}
            destination={destination}
            expandedTaskIds={expandedTaskIds}
            onSelectTask={onSelectTask}
            onToggleTaskExpand={onToggleTaskExpand}
            onToggleTaskCompleted={onToggleTaskCompleted}
          />
        ))}
    </Fragment>
  );
}

type TaskDateGroupsProps = {
  groups: TaskDateGroup[];
  destination: TasksDestination;
  expandedTaskIds: Record<string, boolean>;
  onSelectTask: (taskId: string) => void;
  onToggleTaskExpand: (taskId: string) => void;
  onToggleTaskCompleted: (taskId: string, completed: boolean) => void;
};

function TaskDateGroups({
  groups,
  destination,
  expandedTaskIds,
  onSelectTask,
  onToggleTaskExpand,
  onToggleTaskCompleted,
}: TaskDateGroupsProps) {
  return (
    <>
      {groups.map((group) => (
        <Group key={group.subheader} subheader={group.subheader}>
          {group.tasks.map((task) => (
            <TaskSidebarRow
              key={task.id}
              task={task}
              destination={destination}
              expandedTaskIds={expandedTaskIds}
              onSelectTask={onSelectTask}
              onToggleTaskExpand={onToggleTaskExpand}
              onToggleTaskCompleted={onToggleTaskCompleted}
            />
          ))}
        </Group>
      ))}
    </>
  );
}

export function TasksTab() {
  const [destination, setDestination] = useState<TasksDestination>({
    kind: 'nav',
    id: 'all-tasks',
  });
  const [todayTasks, setTodayTasks] = useState<TaskMock[]>(TODAY_MOCK_TASKS);
  const [overdueGroups, setOverdueGroups] =
    useState<TaskDateGroup[]>(OVERDUE_MOCK_GROUPS);
  const [upcomingGroups, setUpcomingGroups] =
    useState<TaskDateGroup[]>(UPCOMING_MOCK_GROUPS);
  const [expandedTaskIds, setExpandedTaskIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedSections, setExpandedSections] = useState<
    Record<TasksSectionId, boolean>
  >({
    today: true,
    overdue: true,
    upcoming: true,
  });

  const toggleSection = (sectionId: TasksSectionId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTaskIds((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const toggleTaskCompleted = (taskId: string, completed: boolean) => {
    const updater = (task: TaskMock) => ({ ...task, completed });

    setTodayTasks((prev) => updateTaskInTree(prev, taskId, updater));
    setOverdueGroups((prev) => updateTaskInGroups(prev, taskId, updater));
    setUpcomingGroups((prev) => updateTaskInGroups(prev, taskId, updater));
  };

  const todaySection = getTodaySectionDisplay(todayTasks);
  const overdueSection = getScheduledSectionDisplay(
    overdueGroups,
    'No overdue task'
  );
  const upcomingSection = getScheduledSectionDisplay(
    upcomingGroups,
    'Nothing planned yet'
  );

  const taskRowProps = {
    destination,
    expandedTaskIds,
    onSelectTask: (taskId: string) =>
      setDestination({ kind: 'task', id: taskId }),
    onToggleTaskExpand: toggleTaskExpand,
    onToggleTaskCompleted: toggleTaskCompleted,
  };

  const navigation = (
    <Section title="Tasks" hasGroups>
      <Group>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <InteractiveItem
              key={item.id}
              variant="default"
              active={destination.kind === 'nav' && destination.id === item.id}
              onClick={() => setDestination({ kind: 'nav', id: item.id })}
              startSlot={
                <div className="interactive-item__icon">
                  <Icon />
                </div>
              }
            >
              <span className="interactive-item__label">{item.label}</span>
            </InteractiveItem>
          );
        })}
      </Group>
    </Section>
  );

  return (
    <SidebarPanel navigation={navigation}>
      <Section
        title="Today"
        collapsible
        isExpanded={expandedSections.today}
        onToggle={() => toggleSection('today')}
        active={destination.kind === 'section' && destination.id === 'today'}
        onClick={() => setDestination({ kind: 'section', id: 'today' })}
        hasGroups={todaySection.hasGroups}
        emptyMessage={todaySection.emptyMessage}
      >
        {todaySection.hasGroups && (
          <Group>
            {todayTasks.map((task) => (
              <TaskSidebarRow key={task.id} task={task} {...taskRowProps} />
            ))}
          </Group>
        )}
      </Section>

      <Section
        title="Overdue"
        collapsible
        isExpanded={expandedSections.overdue}
        onToggle={() => toggleSection('overdue')}
        active={destination.kind === 'section' && destination.id === 'overdue'}
        onClick={() => setDestination({ kind: 'section', id: 'overdue' })}
        hasGroups={overdueSection.hasGroups}
        emptyMessage={overdueSection.emptyMessage}
      >
        {overdueSection.hasGroups && (
          <TaskDateGroups groups={overdueGroups} {...taskRowProps} />
        )}
      </Section>

      <Section
        title="Upcoming"
        collapsible
        isExpanded={expandedSections.upcoming}
        onToggle={() => toggleSection('upcoming')}
        active={destination.kind === 'section' && destination.id === 'upcoming'}
        onClick={() => setDestination({ kind: 'section', id: 'upcoming' })}
        hasGroups={upcomingSection.hasGroups}
        emptyMessage={upcomingSection.emptyMessage}
      >
        {upcomingSection.hasGroups && (
          <TaskDateGroups groups={upcomingGroups} {...taskRowProps} />
        )}
      </Section>
    </SidebarPanel>
  );
}
