import './CardDivider.css';

export type CardDividerVariant = 'solid' | 'wavy' | 'dotted';

export interface CardDividerProps {
  /** The line's look; `solid` (a 1px rule) when omitted. */
  variant?: CardDividerVariant;
}

/**
 * A rule across a card, inset from both sides. A generic visual — it knows
 * nothing about settings or when to show; the caller decides both. The wavy
 * and dotted variants are the editor's own horizontal-rule shapes, the same
 * three the page's header separator offers.
 */
export function CardDivider({ variant = 'solid' }: CardDividerProps) {
  return <div className={`card-divider card-divider--${variant}`} data-variant={variant} role="separator" />;
}
