import { RoundIconButton } from '@components/button/RoundIconButton';
import { Dialog } from '@components/dialog/Dialog';
import { SettingsGroup } from '@features/settings/settings-group/SettingsGroup';
import { ShortcutEntry } from './ShortcutEntry';
import type { ShortcutRowGroup } from './shortcutRows';
import '@features/settings/settings-page/SettingsPage.css';
import '@components/confirmation/Confirmation.css';
import './ShortcutsDialog.css';

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  groups: readonly ShortcutRowGroup[];
}

/**
 * The Keyboard shortcuts dialog's layout: a Settings-style page of titled groups, one entry per row, its keys on the
 * right (`ShortcutEntry`, shared with the Markdown guide dialog).
 */
export function ShortcutsDialog({ open, onClose, title, groups }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="large" className="shortcuts-dialog">
      <div className="confirmation shortcuts-dialog__card">
        {/* Outside the scrolling page, as in Settings, so the button stays in the corner. */}
        <RoundIconButton className="shortcuts-dialog__close" icon="dismiss" aria-label="Close" onClick={onClose} />
        <div className="shortcuts-dialog__page">
          <h1 className="settings-page__title shortcuts-dialog__heading">{title}</h1>
          <div className="shortcuts-dialog__list">
            {groups.map((group) => (
              <SettingsGroup key={group.title} className="shortcuts-dialog__group" title={group.title}>
                {group.rows.map((row) => (
                  <ShortcutEntry key={row.id} row={row} />
                ))}
              </SettingsGroup>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
