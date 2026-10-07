import { useRef, useState } from 'react';
import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { TasksViewSettingsMenu } from '../sidebar/TasksViewSettingsMenu';
import type { TaskDisplayConfig } from '../helpers/groupTasks';

import { tasksShortcuts, type TasksShortcutId } from './tasksShortcuts.config';

interface TasksShortcutsProps {
  onShortcut: (id: TasksShortcutId) => void;
  /**
   * Asks the sidebar to open the New task dialog. The dialog is hosted by
   * Sidebar (not here) so the sidebar top controls' New task can open the
   * same one without this panel being mounted — 'create-task' never
   * dispatches through onShortcut/NavigationRouter, see
   * tasksShortcuts.config.ts's own comment on why.
   */
  onRequestNewTask: () => void;
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
  onRequestNewTask,
  tasksViewConfig,
  onTasksViewConfigChange,
}: TasksShortcutsProps) {
  // The Options row's menu open state — local, never persisted.
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

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
              onRequestNewTask();
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
    </Section>
  );
}
