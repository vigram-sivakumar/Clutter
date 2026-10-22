import { RoundIconButton } from '@components/button/RoundIconButton';
import { ShortcutKey } from '@components/shortcut-key/ShortcutKey';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { Dialog } from '@components/dialog/Dialog';
import { SettingsGroup } from '@features/settings/settings-group/SettingsGroup';
import { SettingsEntry } from '@features/settings/settings-entry/SettingsEntry';
import '@features/settings/settings-page/SettingsPage.css';
import '@components/confirmation/Confirmation.css';
import './KeyboardShortcutsDialog.css';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** One key: an icon from the registry (a modifier, a bracket), or a text label for a key with no icon. */
type ShortcutKeySpec = SystemIcon | { label: string };

/** A row: just its title, or its title and the keys that trigger it. */
type ShortcutEntry = string | { title: string; keys: readonly ShortcutKeySpec[] };

const SHORTCUT_GROUPS: readonly { title: string; entries: readonly ShortcutEntry[] }[] = [
  {
    title: 'Navigation',
    entries: [
      { title: 'Go back', keys: ['command', 'bracketLeft'] },
      { title: 'Go forward', keys: ['command', 'bracketRight'] },
      { title: 'Open search', keys: ['command', { label: 'K' }] },
      { title: 'Open Settings', keys: ['command', 'comma'] },
      { title: 'Open Trash', keys: ['shift', 'command', { label: 'Delete' }] },
      { title: 'Go to Notes', keys: ['command', { label: '1' }] },
      { title: 'Go to Daily notes', keys: ['command', { label: '2' }] },
      { title: 'Go to Tasks', keys: ['command', { label: '3' }] },
      { title: 'Go to Tags', keys: ['command', { label: '4' }] },
    ],
  },
  { title: 'Create', entries: [{ title: 'New note', keys: ['command', { label: 'N' }] }, { title: 'Today’s daily note', keys: ['shift', 'command', { label: 'D' }] }, { title: 'New folder', keys: ['shift', 'command', { label: 'N' }] }, { title: 'New task', keys: ['shift', 'command', { label: 'T' }] }, { title: 'New tag', keys: ['option', 'command', { label: 'T' }] }, 'New template'] },
  { title: 'Interface', entries: [{ title: 'Toggle sidebar', keys: ['command', { label: '\\' }] }, { title: 'Toggle full screen', keys: ['control', 'command', { label: 'F' }] }, { title: 'Toggle cover image', keys: ['shift', 'command', { label: '\\' }] }, { title: 'Close dialog / dismiss overlay', keys: [{ label: 'Esc' }] }, { title: 'Cancel', keys: [{ label: 'Esc' }] }] },
  { title: 'Application', entries: [{ title: 'Show keyboard shortcuts', keys: ['command', { label: '/' }] }, { title: 'Move to trash', keys: ['command', { label: 'Delete' }] }, { title: 'Quit Clutter', keys: ['command', { label: 'Q' }] }] },
];

/** The keyboard shortcuts reference, opened from the footer's Help menu. */
export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size="large" className="shortcuts-dialog">
      <div className="confirmation shortcuts-dialog__card">
        {/* Outside the scrolling page, as in Settings, so the button stays in the corner. */}
        <RoundIconButton
          className="shortcuts-dialog__close"
          icon="dismiss"
          aria-label="Close"
          onClick={onClose}
        />
        <div className="shortcuts-dialog__page">
          <h1 className="settings-page__title shortcuts-dialog__heading">Keyboard shortcuts</h1>
          <div className="shortcuts-dialog__list">
            {SHORTCUT_GROUPS.map((group) => (
              <SettingsGroup key={group.title} className="shortcuts-dialog__group" title={group.title}>
                {group.entries.map((entry) => {
                  const { title, keys } = typeof entry === 'string' ? { title: entry, keys: [] } : entry;
                  return (
                    <SettingsEntry
                      key={title}
                      title={title}
                      trailing={
                        keys.length > 0 && (
                          <div className="shortcuts-dialog__keys">
                            {keys.map((key) =>
                              typeof key === 'string' ? (
                                <ShortcutKey key={key} leading={<AppIcon icon={key} />} />
                              ) : (
                                <ShortcutKey key={key.label} label={key.label} />
                              )
                            )}
                          </div>
                        )
                      }
                    />
                  );
                })}
              </SettingsGroup>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
