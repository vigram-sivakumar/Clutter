import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { tasksShortcuts, type TasksShortcutId } from './tasksShortcuts.config';

interface TasksShortcutsProps {
  onShortcut: (id: TasksShortcutId) => void;
  /** Opens the New task dialog hosted by Sidebar. */
  onRequestNewTask: () => void;
}

export function TasksShortcuts({ onShortcut, onRequestNewTask }: TasksShortcutsProps) {
  return (
    <Section>
      {tasksShortcuts.map((shortcut) => (
        <Navigation
          key={shortcut.id}
          title={shortcut.title}
          leading={<AppIcon icon={shortcut.icon} />}
          disabled={shortcut.disabled}
          onClick={() => {
            if (shortcut.id === 'create-task') {
              onRequestNewTask();
            } else {
              onShortcut(shortcut.id);
            }
          }}
        />
      ))}
    </Section>
  );
}
