import type { HTMLAttributes } from 'react';

import { Button } from '../Button';
import { CustomIcons, ICON_MEDIUM, type ClutterIcon } from '../../design-system/icons';

export type HeaderProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: string;
  /** Optional leading icon (Figma `iconLeft`). */
  icon?: ClutterIcon;
  /** When true, the chevron is rotated to indicate expanded content. */
  expanded?: boolean;
  /**
   * Invoked only when the chevron control is activated (Figma: xsmall `Button`),
   * not when clicking the label row.
   */
  onToggle?: () => void;
};

const Chevron = CustomIcons.CaretRight;

/**
 * Section header row (Figma: SectionHeader, node 303:28618).
 * The row shows hover; expand/collapse is only via the secondary xsmall chevron button.
 */
export function Header({
  label,
  icon: Icon,
  expanded = false,
  className,
  onToggle,
  ...props
}: HeaderProps) {
  const cls = ['clutter-section-header', className].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      data-expanded={expanded ? 'true' : 'false'}
      {...props}
    >
      {Icon ? (
        <span className="clutter-section-header__icon" aria-hidden>
          <Icon size={ICON_MEDIUM} />
        </span>
      ) : null}
      <span className="clutter-section-header__label">{label}</span>
      <span className="clutter-section-header__chevron-slot">
        <Button
          type="button"
          variant="ghost"
          size="xsmall"
          iconOnly={Chevron}
          className="clutter-section-header__chevron-btn"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse section' : 'Expand section'}
          disabled={onToggle === undefined}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
        />
      </span>
    </div>
  );
}
