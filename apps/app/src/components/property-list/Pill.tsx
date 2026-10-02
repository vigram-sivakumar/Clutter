import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface PillProps {
  /** `tag` is the editor's inline tag look; `plain` a neutral surface for non-tag values. */
  tone?: 'tag' | 'plain';
  /** The pill's content (a tag's `#` prefix and label, or a plain value). */
  children: ReactNode;
  /** Makes the pill a button: click (or Enter/Space when focused) fires this. */
  onActivate?(): void;
  /** Accessible name of the pill-as-button; used only with `onActivate`. */
  activateLabel?: string;
  /** Extra modifier classes, e.g. `property-list__tag--link`. */
  className?: string;
  /** Shows the hover dismiss button, which fires this. */
  onRemove?(): void;
  /** Accessible name of the dismiss button; used only with `onRemove`. */
  removeLabel?: string;
}

/**
 * The one pill every list Property renders its values with (tags,
 * multi-select values such as aliases) — the pill shape, and the hover
 * dismiss button absolutely positioned over its right end so showing it
 * never shifts the row. Owning both here is what keeps the dismiss button
 * in the same place on every pill; the geometry itself lives in
 * `.property-list__tag` / `.property-list__tag-remove` (PropertyList.css).
 *
 * Neither the activate nor the dismiss click reaches the editor's "click
 * anywhere to type" handler, and the dismiss click never reaches the
 * pill's own.
 */
export function Pill({
  tone = 'tag',
  children,
  onActivate,
  activateLabel,
  className,
  onRemove,
  removeLabel,
}: PillProps) {
  function handleRemove(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onRemove?.();
  }

  function handleActivate(event: MouseEvent<HTMLSpanElement>) {
    event.stopPropagation();
    onActivate?.();
  }

  function handleActivateKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onActivate?.();
  }

  return (
    <span
      className={['property-list__tag', tone === 'plain' && 'property-list__tag--plain', className]
        .filter(Boolean)
        .join(' ')}
      // A <span>, not a <button>: it contains the dismiss <button>, and
      // buttons can't nest.
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={onActivate ? activateLabel : undefined}
      onClick={onActivate ? handleActivate : undefined}
      onKeyDown={onActivate ? handleActivateKeyDown : undefined}
    >
      {children}
      {onRemove && (
        <Button
          className="property-list__tag-remove"
          isIconOnly
          variant="ghost"
          size="small"
          aria-label={removeLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleRemove}
        >
          <AppIcon icon="dismiss" />
        </Button>
      )}
    </span>
  );
}
