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
  /** `small` is the compact variant (20px, label-small text) for pills beside page chrome, e.g. the Template pill; default is the 24px property-list pill. */
  size?: 'default' | 'small';
  /** Accessible name of the pill-as-button; used only when it is clickable. */
  label?: string;
  /** Adds a dismiss button, shown while the pill is hovered, which fires this. */
  onRemove?(): void;
  /** Accessible name of the dismiss button; used only with `onRemove`. */
  removeLabel?: string;
} & PillClickAction;

/**
 * The one pill every list Property renders its values with (tags,
 * multi-select values such as aliases) — the pill shape, and the dismiss
 * button, a round badge on its top-right corner, shown while the pill is
 * hovered. Owning both here is what keeps the dismiss button in the same
 * place on every pill; the geometry itself lives in
 * `.pill` / `.pill__remove` (Pill.css).
 *
 * Neither the click action nor the dismiss click reaches the editor's
 * "click anywhere to type" handler, and the dismiss click never reaches
 * the pill's own.
 */
export function Pill({
  children,
  size = 'default',
  label,
  onNavigate,
  onEdit,
  onRemove,
  removeLabel,
}: PillProps) {
  const onActivate = onNavigate ?? onEdit;

  // Only an interactive pill is a button (a <span>, not a <button>: it contains the dismiss <button>, and buttons
  // can't nest). An inert one carries no role, tab stop or handlers. Neither the click nor the key press reaches the
  // editor's "click anywhere to type" handler.
  const interactiveProps = onActivate && {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick(event: MouseEvent<HTMLSpanElement>) {
      event.stopPropagation();
      onActivate();
    },
    onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
      // Enter/Space on the pill itself only: on the dismiss button inside it they belong to that button.
      if (
        event.target !== event.currentTarget ||
        (event.key !== 'Enter' && event.key !== ' ')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onActivate();
    },
  };

  return (
    <span
      className={size === 'small' ? 'pill pill--small' : 'pill'}
      {...interactiveProps}
    >
      {/* The pill's text: the one part that truncates (Pill.css). */}
      <span className="pill__label">{children}</span>
      {onRemove && (
        <Button
          className="pill__remove"
          isIconOnly
          variant="ghost"
          interaction="subtle"
          size="small"
          aria-label={removeLabel}
          // Pressing it never takes focus from the editor's input.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            // It is inside the pill: the click must not also activate the pill, or reach the editor.
            event.stopPropagation();
            onRemove();
          }}
        >
          <AppIcon icon="dismiss" size={12} />
        </Button>
      )}
    </span>
  );
}
