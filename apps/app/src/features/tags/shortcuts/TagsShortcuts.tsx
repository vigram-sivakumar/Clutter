import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';

import { tagsShortcuts, type TagsShortcutId } from './tagsShortcuts.config';

interface TagsShortcutsProps {
  onShortcut: (id: TagsShortcutId) => void;
}

export function TagsShortcuts({ onShortcut }: TagsShortcutsProps) {
  return (
    <Section>
      {tagsShortcuts.map((shortcut) => (
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
