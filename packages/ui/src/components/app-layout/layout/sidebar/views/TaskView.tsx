import { useMemo, useCallback, ReactNode } from 'react';
import {
  useNotesStore,
  useUIStateStore,
  useCurrentDateStore,
} from '@clutter/state';
import {
  getTodayDateString,
  formatTaskDateLabel,
  compareDates,
  extractTasksFromNote,
  toggleTaskInNote,
  categorizeTasks,
  sortTasksByDateAndCreation,
  sortTasksByCreation,
  type Task,
} from '@clutter/shared';
import { useTheme } from '../../../../../hooks/useTheme';
import { SidebarItemTask } from '../items/TaskItem';
import { SidebarSection } from '../sections/Section';
import { SidebarListGroup } from '../sections/ListGroup';
import { sidebarLayout } from '../../../../../tokens/sidebar';
import { Note } from '@clutter/domain';
import { GlobalSelection } from '../types';
import { SECTIONS } from '../../../../../config/sidebarConfig';

// Use shared Task type
export type TaskWithDate = Task;

// Abbreviated month names for section title
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

interface TaskViewProps {
  onTaskClick?: (_noteId: string, _taskId: string) => void;

  // Selection
  selection: GlobalSelection;
  openContextMenuId?: string | null;
  onClearSelection?: () => void;

  // Actions
  getTaskActions?: (_taskId: string, _noteId: string) => ReactNode[];

  // Multi-select
  selectedTaskIds?: Set<string>;
  onTaskMultiSelect?: (_taskId: string, _event?: React.MouseEvent) => void;

  // Header click handlers for navigation to full page views
  onTodayHeaderClick?: () => void;
  onUpcomingHeaderClick?: () => void;
  onUnplannedHeaderClick?: () => void;
  onCompletedHeaderClick?: () => void;
}

export const TaskView = ({
  onTaskClick,
  openContextMenuId,
  onClearSelection,
  getTaskActions,
  selectedTaskIds,
  onTaskMultiSelect,
  selection: _selection,
  onTodayHeaderClick,
  onUpcomingHeaderClick,
  onUnplannedHeaderClick,
  onCompletedHeaderClick,
}: TaskViewProps) => {
  const notes = useNotesStore((state) => state.notes);
  const updateNoteContent = useNotesStore((state) => state.updateNoteContent);
  const { colors } = useTheme();

  // Get current date from global store (auto-updates at midnight)
  const currentDate = useCurrentDateStore((state) => state.date);
  const currentMonth = useCurrentDateStore((state) => state.month);

  // Compute "Today, 7 Jan" title (reactively updates at midnight)
  const todaySectionTitle = useMemo(() => {
    const monthAbbr = MONTH_NAMES[currentMonth];
    return `Today, ${currentDate} ${monthAbbr}`;
  }, [currentDate, currentMonth]);

  // Get collapse states from UI state store
  const {
    taskTodayCollapsed,
    taskUpcomingCollapsed,
    taskUnplannedCollapsed,
    taskCompletedCollapsed,
    setTaskTodayCollapsed,
    setTaskUpcomingCollapsed,
    setTaskUnplannedCollapsed,
    setTaskCompletedCollapsed,
  } = useUIStateStore();

  const todayDateString = useMemo(() => getTodayDateString(), []);

  // Extract all tasks from all active notes
  const allTasks = useMemo(() => {
    const activeNotes = notes.filter((n: Note) => !n.deletedAt);
    const tasks: Task[] = [];

    activeNotes.forEach((note) => {
      const noteTasks = extractTasksFromNote(note);
      tasks.push(...noteTasks);
    });

    return tasks;
  }, [notes]);

  // Categorize tasks into sections using centralized logic
  const { todayTasks, upcomingTasks, unplannedTasks, completedTasks } =
    useMemo(() => {
      // Use centralized categorization (SINGLE SOURCE OF TRUTH)
      const categorized = categorizeTasks(allTasks, todayDateString);

      return {
        todayTasks: sortTasksByDateAndCreation(categorized.today),
        upcomingTasks: sortTasksByDateAndCreation(categorized.upcoming),
        unplannedTasks: sortTasksByCreation(categorized.inbox),
        completedTasks: sortTasksByCreation(categorized.completed),
      };
    }, [allTasks, todayDateString]);

  // Group today tasks by date with "Overdue" grouping
  const groupedTodayTasks = useMemo(() => {
    const overdueGroup: Task[] = [];
    const todayGroup: Task[] = [];

    todayTasks.forEach((task) => {
      const effectiveDate = task.date || task.dailyNoteDate;
      if (effectiveDate && compareDates(effectiveDate, todayDateString) < 0) {
        overdueGroup.push(task);
      } else {
        todayGroup.push(task);
      }
    });

    // Sort overdue tasks by date (oldest to newest)
    overdueGroup.sort((a, b) => {
      const dateA = a.date || a.dailyNoteDate || '';
      const dateB = b.date || b.dailyNoteDate || '';
      const dateComparison = compareDates(dateA, dateB);
      if (dateComparison !== 0) return dateComparison;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const grouped = new Map<string, Task[]>();
    // Today's tasks come first (no group title needed)
    if (todayGroup.length > 0) {
      grouped.set(todayDateString, todayGroup);
    }
    // Overdue tasks come second (demoted, with group title)
    if (overdueGroup.length > 0) {
      grouped.set('__overdue__', overdueGroup);
    }

    return grouped;
  }, [todayTasks, todayDateString]);

  // Group upcoming tasks by date (only future dates, excluding today and overdue)
  const groupedUpcomingTasks = useMemo(() => {
    const dateGroups = new Map<string, Task[]>();

    upcomingTasks.forEach((task) => {
      const effectiveDate = task.date || task.dailyNoteDate;
      if (effectiveDate) {
        // Only include tasks with future dates (after today)
        if (compareDates(effectiveDate, todayDateString) > 0) {
          if (!dateGroups.has(effectiveDate)) {
            dateGroups.set(effectiveDate, []);
          }
          dateGroups.get(effectiveDate)!.push(task);
        }
      }
    });

    // Build final map with sorted dates
    const grouped = new Map<string, Task[]>();
    const sortedDates = Array.from(dateGroups.entries()).sort((a, b) =>
      compareDates(a[0], b[0])
    );
    sortedDates.forEach(([date, tasks]) => {
      grouped.set(date, tasks);
    });

    return grouped;
  }, [upcomingTasks, todayDateString]);

  // Calculate actual count of tasks in grouped upcoming (for accurate badge)
  const upcomingTasksCount = useMemo(() => {
    let count = 0;
    groupedUpcomingTasks.forEach((tasks) => {
      count += tasks.length;
    });
    return count;
  }, [groupedUpcomingTasks]);

  // Group completed tasks by completion date (when they were actually completed)
  const groupedCompletedTasks = useMemo(() => {
    const dateGroups = new Map<string, Task[]>();

    completedTasks.forEach((task) => {
      // Get completion date (YYYY-MM-DD format)
      // Extract date part from ISO string (YYYY-MM-DD) or fallback to today
      const completionDate: string =
        task.completedAt?.split('T')[0] || todayDateString;

      if (!dateGroups.has(completionDate)) {
        dateGroups.set(completionDate, []);
      }
      dateGroups.get(completionDate)!.push(task);
    });

    // Sort tasks within each date by completion time (most recent first)
    dateGroups.forEach((tasks) => {
      tasks.sort((a, b) => {
        const timeA = a.completedAt
          ? new Date(a.completedAt).getTime()
          : new Date(a.createdAt).getTime();
        const timeB = b.completedAt
          ? new Date(b.completedAt).getTime()
          : new Date(b.createdAt).getTime();
        return timeB - timeA; // Most recent first
      });
    });

    // Build final map - sorted by date (most recent first)
    const grouped = new Map<string, Task[]>();
    const sortedDates = Array.from(dateGroups.entries()).sort((a, b) =>
      compareDates(b[0], a[0])
    ); // Reverse order - newest first

    sortedDates.forEach(([date, tasks]) => {
      grouped.set(date, tasks);
    });

    return grouped;
  }, [completedTasks, todayDateString]);

  // Handle checkbox toggle
  const handleToggleTask = useCallback(
    (taskId: string) => {
      const task = allTasks.find((t) => t.id === taskId);
      if (!task) return;

      const note = notes.find((n) => n.id === task.noteId);
      if (!note) return;

      // Update note content immediately (keeps editor in sync)
      const updatedContent = toggleTaskInNote(note, taskId);
      updateNoteContent(note.id, updatedContent);
    },
    [allTasks, notes, updateNoteContent]
  );

  // Handle task navigation
  const handleTaskNavigate = (noteId: string, blockId: string) => {
    onTaskClick?.(noteId, blockId);
  };

  // Handle task selection
  const handleTaskClick = (taskId: string, event?: React.MouseEvent) => {
    if (onTaskMultiSelect) {
      onTaskMultiSelect(taskId, event);
    }
  };

  // Render grouped tasks with timeline connectors
  const renderGroupedTasks = (
    groupedTasks: Map<string, Task[]>,
    sectionPrefix: string
  ) => {
    // Return null if no tasks to allow empty state to show
    if (groupedTasks.size === 0) {
      return null;
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: sidebarLayout.itemToItemGap,
          width: '100%',
          minWidth: 0, // Allow shrinking below content size
        }}
      >
        {Array.from(groupedTasks.entries()).map(([date, tasks]) => {
          const isOverdue = date === '__overdue__';
          const isNoDate = date === '__no_date__';
          const isToday = date === todayDateString;

          // Skip group title for today's tasks in Today section (clean hierarchy)
          if (isToday && sectionPrefix === 'today') {
            return (
              <div key={date}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      marginBottom: sidebarLayout.itemToItemGap,
                    }}
                  >
                    <SidebarItemTask
                      id={task.id}
                      noteId={task.noteId}
                      noteTitle={task.noteTitle}
                      text={task.text}
                      checked={task.checked}
                      isSelected={selectedTaskIds?.has(task.id)}
                      hasOpenContextMenu={openContextMenuId === task.id}
                      onClick={(e) => handleTaskClick(task.id, e)}
                      onToggle={handleToggleTask}
                      onNavigate={handleTaskNavigate}
                      actions={getTaskActions?.(task.id, task.noteId)}
                    />
                  </div>
                ))}
              </div>
            );
          }

          // For all other groups (Overdue, Upcoming dates, etc.), show group title
          let label: string;
          if (isOverdue) {
            label = 'Overdue';
          } else if (isNoDate) {
            label = 'No date';
          } else {
            label = formatTaskDateLabel(date, todayDateString);
          }

          // Only show calendar accent for "Today" in active sections (not Completed)
          const connectorColor =
            isToday && sectionPrefix !== 'completed'
              ? colors.semantic.calendarAccent
              : colors.border.default;

          const labelColor =
            isToday && sectionPrefix !== 'completed'
              ? colors.semantic.calendarAccent
              : undefined;

          return (
            <SidebarListGroup
              key={date}
              id={`group-${sectionPrefix}-${date}`}
              title={label}
              connectorColor={connectorColor}
              labelColor={labelColor}
              showConnector={false}
              sticky={true}
              showDivider={false}
            >
              {tasks.map((task) => {
                // Show date badge for overdue tasks only
                const taskDate = task.date || task.dailyNoteDate;
                const badge =
                  isOverdue && taskDate
                    ? formatTaskDateLabel(taskDate, todayDateString)
                    : undefined;

                return (
                  <div
                    key={task.id}
                    style={{
                      marginBottom: sidebarLayout.itemToItemGap,
                    }}
                  >
                    <SidebarItemTask
                      id={task.id}
                      noteId={task.noteId}
                      noteTitle={task.noteTitle}
                      text={task.text}
                      checked={task.checked}
                      badge={badge}
                      isSelected={selectedTaskIds?.has(task.id)}
                      hasOpenContextMenu={openContextMenuId === task.id}
                      onClick={(e) => handleTaskClick(task.id, e)}
                      onToggle={handleToggleTask}
                      onNavigate={handleTaskNavigate}
                      actions={getTaskActions?.(task.id, task.noteId)}
                    />
                  </div>
                );
              })}
            </SidebarListGroup>
          );
        })}
      </div>
    );
  };

  return (
    <div
      onClick={onClearSelection}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: sidebarLayout.sectionToSectionGap,
      }}
    >
      {/* Today Section */}
      <SidebarSection
        title={todaySectionTitle}
        titleColor={colors.semantic.calendarAccent} // Always highlight "Today" date
        isCollapsed={taskTodayCollapsed}
        onToggle={() => setTaskTodayCollapsed(!taskTodayCollapsed)}
        isToggleDisabled={todayTasks.length === 0 && taskTodayCollapsed} // Only disable when empty AND collapsed
        onHeaderClick={onTodayHeaderClick}
        emptyMessage={SECTIONS.today.emptyMessage}
        emptyShortcut={SECTIONS.today.emptyShortcut}
        emptySuffix={SECTIONS.today.emptySuffix}
        badge={todayTasks.length > 0 ? todayTasks.length.toString() : undefined}
      >
        {renderGroupedTasks(groupedTodayTasks, 'today')}
      </SidebarSection>

      {/* Upcoming Section */}
      <SidebarSection
        title={SECTIONS.upcoming.label}
        isCollapsed={taskUpcomingCollapsed}
        onToggle={() => setTaskUpcomingCollapsed(!taskUpcomingCollapsed)}
        isToggleDisabled={upcomingTasksCount === 0 && taskUpcomingCollapsed} // Only disable when empty AND collapsed
        onHeaderClick={onUpcomingHeaderClick}
        emptyMessage={SECTIONS.upcoming.emptyMessage}
        emptyShortcut={SECTIONS.upcoming.emptyShortcut}
        emptySuffix={SECTIONS.upcoming.emptySuffix}
        badge={
          upcomingTasksCount > 0 ? upcomingTasksCount.toString() : undefined
        }
      >
        {renderGroupedTasks(groupedUpcomingTasks, 'upcoming')}
      </SidebarSection>

      {/* Someday Section */}
      <SidebarSection
        title={SECTIONS.inbox.label}
        isCollapsed={taskUnplannedCollapsed}
        onToggle={() => setTaskUnplannedCollapsed(!taskUnplannedCollapsed)}
        isToggleDisabled={unplannedTasks.length === 0 && taskUnplannedCollapsed} // Only disable when empty AND collapsed
        onHeaderClick={onUnplannedHeaderClick}
        emptyMessage={SECTIONS.inbox.emptyMessage}
        emptyShortcut={SECTIONS.inbox.emptyShortcut}
        emptySuffix={SECTIONS.inbox.emptySuffix}
        badge={
          unplannedTasks.length > 0
            ? unplannedTasks.length.toString()
            : undefined
        }
      >
        {unplannedTasks.map((task) => (
          <div
            key={task.id}
            style={{
              marginBottom: sidebarLayout.itemToItemGap,
            }}
          >
            <SidebarItemTask
              id={task.id}
              noteId={task.noteId}
              noteTitle={task.noteTitle}
              text={task.text}
              checked={task.checked}
              isSelected={selectedTaskIds?.has(task.id)}
              hasOpenContextMenu={openContextMenuId === task.id}
              onClick={(e) => handleTaskClick(task.id, e)}
              onToggle={handleToggleTask}
              onNavigate={handleTaskNavigate}
              actions={getTaskActions?.(task.id, task.noteId)}
            />
          </div>
        ))}
      </SidebarSection>

      {/* Completed Section */}
      <SidebarSection
        title={SECTIONS.completed.label}
        isCollapsed={taskCompletedCollapsed}
        onToggle={() => setTaskCompletedCollapsed(!taskCompletedCollapsed)}
        isToggleDisabled={completedTasks.length === 0 && taskCompletedCollapsed} // Only disable when empty AND collapsed
        onHeaderClick={onCompletedHeaderClick}
        emptyMessage={SECTIONS.completed.emptyMessage}
        badge={
          completedTasks.length > 0
            ? completedTasks.length.toString()
            : undefined
        }
      >
        {renderGroupedTasks(groupedCompletedTasks, 'completed')}
      </SidebarSection>
    </div>
  );
};
