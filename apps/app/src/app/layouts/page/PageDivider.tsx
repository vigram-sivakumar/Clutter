import './PageDivider.css';

export type DividerVariant = 'solid' | 'wavy' | 'dotted';

interface PageDividerProps {
  /** The line's look; `solid` (a 1px rule) when omitted. */
  variant?: DividerVariant;
}

/**
 * The rule between a page's Properties list and its body. Page layout, not Markdown: it is drawn by the page around the
 * editor and is never part of the document, so it is the same on every note and is never saved. The wavy and dotted
 * variants are the editor's own horizontal-rule shapes.
 */
export function PageDivider({ variant = 'solid' }: PageDividerProps) {
  return <div className={`page-divider page-divider--${variant}`} data-variant={variant} role="separator" />;
}
