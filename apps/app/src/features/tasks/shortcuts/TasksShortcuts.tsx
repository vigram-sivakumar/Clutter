import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { TasksViewSettingsMenu } from '../sidebar/TasksViewSettingsMenu';
import type { TaskDisplayConfig } from '../helpers/groupTasks';

import { tasksShortcuts, type TasksShortcutId } from './tasksShortcuts.config';
import { NewTaskDialog } from './NewTaskDialog';

interface TasksShortcutsProps {
  onShortcut: (id: TasksShortcutId) => void;
  /**
   * Creates the task in today's Daily Note (never the due date's —
   * see Sidebar.Tasks.tsx's own onCreateTask) and resolves once it's
   * durable. Rejects on failure, which NewTaskContent uses to decide
   * whether to close itself — plain pass-through, no TaskOperations/
   * PageOperations import here (UI/Features must never import a concrete
   * application-layer class directly, ARCHITECTURE_RULES rule 6).
   */
  onCreateTask: (title: string, dueDate: string | undefined) => Promise<void>;
  /**
   * The shared Tasks-view Show completed / Auto-sort completed preference
   * (owned by AppLayout) — surfaced through the settings action on the
   * All Tasks row, the one place in the sidebar that represents the whole
   * Tasks view rather than a single group (see TasksViewSettingsMenu).
   */
  tasksViewConfig: TaskDisplayConfig;
  onTasksViewConfigChange: (next: TaskDisplayConfig) => void;
}

export function TasksShortcuts({
  onShortcut,
  onCreateTask,
  tasksViewConfig,
  onTasksViewConfigChange,
}: TasksShortcutsProps) {
  // Opens the shared Dialog (Clutter's modal primitive — centered Overlay
  // with its own opaque surface/backdrop/animation, see Dialog.tsx) with
  // NewTaskContent's title field + due-date picker. 'create-task' never
  // dispatches through onShortcut/NavigationRouter — see
  // tasksShortcuts.config.ts's own comment on why.
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  // The All Tasks row's settings-menu open state — local, never persisted.
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

  const closeNewTask = () => setIsNewTaskOpen(false);

  return (
    <Section>
      {tasksShortcuts.map((shortcut) => (
        <Navigation
          key={shortcut.id}
          title={shortcut.title}
          leading={<AppIcon icon={shortcut.icon} />}
          disabled={shortcut.disabled}
          // Only All Tasks carries the Tasks-view settings action, in
          // Entry's always-visible `trailing` slot (hideTrailingOnHover
          // off) rather than the hover-only `actions` slot. Entry's own
          // click guard ignores clicks on the nested button, so opening
          // the menu never also navigates.
          {...(shortcut.id === 'all-tasks' && {
            trailing: (
              <TasksViewSettingsMenu
                config={tasksViewConfig}
                onConfigChange={onTasksViewConfigChange}
                open={isSettingsMenuOpen}
                onOpenChange={setIsSettingsMenuOpen}
              />
            ),
            hideTrailingOnHover: false,
            forceHover: isSettingsMenuOpen,
          })}
          onClick={() =>
            shortcut.id === 'create-task' ? setIsNewTaskOpen(true) : onShortcut(shortcut.id)
          }
        />
      ))}

      <NewTaskDialog open={isNewTaskOpen} onClose={closeNewTask} onCreateTask={onCreateTask} />
    </Section>
  );
}
