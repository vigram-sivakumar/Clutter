import { useRef, useState } from 'react';
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
   * (owned by AppLayout) — surfaced through the sidebar's Options row
   * (see TasksViewSettingsMenu).
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
  // The Options row's menu open state — local, never persisted.
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  const closeNewTask = () => setIsNewTaskOpen(false);

  return (
    <Section>
      {tasksShortcuts.map((shortcut) => (
        <Navigation
          key={shortcut.id}
          title={shortcut.title}
          leading={<AppIcon icon={shortcut.icon} />}
          disabled={shortcut.disabled}
          // Same open-menu state as a row's three-dot menu (Note/Folder/Task): the hover look, not `selected`.
          forceHover={shortcut.id === 'options' && isOptionsOpen}
          {...(shortcut.id === 'options'
            ? { ref: optionsRef, 'aria-haspopup': 'menu' as const, 'aria-expanded': isOptionsOpen }
            : {})}
          onClick={() => {
            if (shortcut.id === 'create-task') {
              setIsNewTaskOpen(true);
            } else if (shortcut.id === 'options') {
              setIsOptionsOpen((open) => !open);
            } else {
              onShortcut(shortcut.id);
            }
          }}
        />
      ))}

      <TasksViewSettingsMenu
        anchorRef={optionsRef}
        config={tasksViewConfig}
        onConfigChange={onTasksViewConfigChange}
        open={isOptionsOpen}
        onOpenChange={setIsOptionsOpen}
      />

      <NewTaskDialog open={isNewTaskOpen} onClose={closeNewTask} onCreateTask={onCreateTask} />
    </Section>
  );
}
