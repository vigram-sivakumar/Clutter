import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

import './Pill.css';

/**
 * What a click (or Enter/Space when focused) on the pill does — never both:
 * - `navigate`: goes somewhere else (a tag opens its Tag Collection);
 * - `edit`: starts editing the value in place (aliases, multi-select).
 * Omit both for a pill that isn't clickable.
 */
type PillClickAction =
  | { onNavigate?(): void; onEdit?: undefined }
  | { onEdit?(): void; onNavigate?: undefined };

type PillProps = {
  /** The pill's content (a tag's `#` prefix and label, or a plain value). */
  children: ReactNode;
  /** Accessible name of the pill-as-button; used only when it is clickable. */
  label?: string;
  /** Shows the hover dismiss button, which fires this. */
  onRemove?(): void;
  /** Accessible name of the dismiss button; used only with `onRemove`. */
  removeLabel?: string;
} & PillClickAction;

/**
 * The one pill every list Property renders its values with (tags,
 * multi-select values such as aliases) — the pill shape, and the hover
 * dismiss button absolutely positioned over its right end so showing it
 * never shifts the row. Owning both here is what keeps the dismiss button
 * in the same place on every pill; the geometry itself lives in
 * `.pill` / `.pill__remove` (Pill.css).
 *
 * Neither the click action nor the dismiss click reaches the editor's
 * "click anywhere to type" handler, and the dismiss click never reaches
 * the pill's own.
 */
export function Pill({
  children,
  label,
  onNavigate,
  onEdit,
  onRemove,
  removeLabel,
}: PillProps) {
  const onActivate = onNavigate ?? onEdit;

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
      className="pill"
      // A <span>, not a <button>: it contains the dismiss <button>, and
      // buttons can't nest.
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-label={onActivate ? label : undefined}
      onClick={onActivate ? handleActivate : undefined}
      onKeyDown={onActivate ? handleActivateKeyDown : undefined}
    >
      {children}
      {onRemove && (
        <Button
          className="pill__remove"
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
