import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';

import { tasksShortcuts, type TasksShortcutId } from './tasksShortcuts.config';

interface TasksShortcutsProps {
  onShortcut: (id: TasksShortcutId) => void;
}

export function TasksShortcuts({ onShortcut }: TasksShortcutsProps) {
  return (
    <Section>
      {tasksShortcuts.map((shortcut) => (
        <Navigation
          key={shortcut.id}
          title={shortcut.title}
          leading={<AppIcon icon={shortcut.icon} />}
          onClick={() => onShortcut(shortcut.id)}
        />
      ))}
    </Section>
  );
}
