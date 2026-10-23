import { ShortcutKey } from '@components/shortcut-key/ShortcutKey';
import { AppIcon } from '@shared/icon';
import { SettingsEntry } from '@features/settings/settings-entry/SettingsEntry';
import type { ShortcutRow } from './shortcutRows';
import './ShortcutsDialog.css';

/** What to press: key chips, or — for Markdown syntax that starts a feature — what to type, as plain monospace text. */
export function RowTrailing({ row }: { row: ShortcutRow }) {
  if (row.trigger !== undefined) return <code className="shortcuts-dialog__trigger">{row.trigger}</code>;
  const keys = row.keys ?? [];
  if (keys.length === 0) return null;
  return (
    <div className="shortcuts-dialog__keys">
      {keys.map((key, index) =>
        typeof key === 'string' ? (
          <ShortcutKey key={`${key}-${index}`} leading={<AppIcon icon={key} />} />
        ) : (
          <ShortcutKey key={`${key.label}-${index}`} label={key.label} />
        )
      )}
    </div>
  );
}

/** One row of a shortcuts dialog: its label and supporting text, and its keys or typing trigger on the right. */
export function ShortcutEntry({ row }: { row: ShortcutRow }) {
  return <SettingsEntry title={row.label} description={row.description} trailing={<RowTrailing row={row} />} />;
}
