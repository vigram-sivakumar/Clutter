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
      'Open search',
      { title: 'Open Settings', keys: ['command', { label: ',' }] },
      'Open Trash',
      'Go to Notes',
      'Go to Daily notes',
      'Go to Tasks',
      'Go to Tags',
    ],
  },
  { title: 'Create', entries: ['New note', 'Today’s daily note', 'New folder', 'New task', 'New tag', 'New template'] },
  { title: 'Interface', entries: ['Toggle sidebar', 'Toggle full screen', 'Toggle cover image', 'Close dialog / dismiss overlay', 'Cancel'] },
  { title: 'Application', entries: ['Show keyboard shortcuts', 'Move to trash', 'Quit Clutter'] },
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
