import type { ReactNode } from 'react';
import './ShortcutKey.css';

export interface ShortcutKeyProps {
  /** Usually an `AppIcon` (a modifier key's glyph). Alone, it makes the key a square. */
  leading?: ReactNode;
  /** The key's text, e.g. "N" or "Esc". */
  label?: string;
  className?: string;
}

/** One key of a keyboard shortcut: a 24px-high chip with an optional leading icon and an optional label. */
export function ShortcutKey({ leading, label, className }: ShortcutKeyProps) {
  const iconOnly = leading != null && !label;

  return (
    <span
      className={['shortcut-key', iconOnly && 'shortcut-key--square', className]
        .filter(Boolean)
        .join(' ')}
    >
      {leading != null && <span className="shortcut-key__leading">{leading}</span>}
      {label && <span className="shortcut-key__label">{label}</span>}
    </span>
  );
}
