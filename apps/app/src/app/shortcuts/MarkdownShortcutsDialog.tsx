import { useState } from 'react';
import { RoundIconButton } from '@components/button/RoundIconButton';
import { Dialog } from '@components/dialog/Dialog';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { SettingsPage } from '@features/settings/settings-page/SettingsPage';
import { SettingsGroup } from '@features/settings/settings-group/SettingsGroup';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { ShortcutEntry } from './ShortcutEntry';
import { MARKDOWN_SHORTCUT_GROUPS } from './markdownShortcuts';
import '@features/settings/Settings.css';
import '@features/settings/settings-sidebar/SettingsSidebar.css';

interface MarkdownShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Each category's icon, in the sidebar. */
const CATEGORY_ICONS: Readonly<Record<string, SystemIcon>> = {
  'Text formatting': 'description',
  'Lists': 'multiLine',
  'Links and suggestions': 'link',
  Dividers: 'minus',
  Editing: 'edit',
  'Selection': 'squareDashed',
};

/**
 * The dialog's content. A child of the dialog, so it is mounted only while the dialog is open: the selected
 * category is local to it, and every opening starts on the first one.
 */
function MarkdownShortcutsContent({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState(0);
  const category = MARKDOWN_SHORTCUT_GROUPS[selected]!;

  return (
    // Settings' own frame: the `.settings` container, `.settings-sidebar` with Section / Navigation rows, a
    // SettingsPage for the selected category, and the corner close button.
    <div className="settings">
      <div className="settings-sidebar">
        <Section hasHeader title="Markdown guide">
          {MARKDOWN_SHORTCUT_GROUPS.map((group, index) => (
            <Navigation
              key={group.title}
              title={group.title}
              selected={index === selected}
              leading={CATEGORY_ICONS[group.title] && <AppIcon icon={CATEGORY_ICONS[group.title]!} />}
              onClick={() => setSelected(index)}
            />
          ))}
        </Section>
      </div>
      <SettingsPage key={category.title} title={category.title}>
        {/* The same rows, in the same group styling, as the Keyboard shortcuts dialog. */}
        <SettingsGroup className="shortcuts-dialog__group">
          {category.rows.map((row) => (
            <ShortcutEntry key={row.id} row={row} />
          ))}
        </SettingsGroup>
      </SettingsPage>
      <RoundIconButton className="settings__close" icon="dismiss" aria-label="Close" onClick={onClose} />
    </div>
  );
}

/** The Markdown editor's own keys and typing triggers, opened from the footer's Help menu. */
export function MarkdownShortcutsDialog({ open, onClose }: MarkdownShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} className="settings-dialog">
      <MarkdownShortcutsContent onClose={onClose} />
    </Dialog>
  );
}
