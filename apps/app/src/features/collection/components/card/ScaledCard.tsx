import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import './ScaledCard.css';

/**
 * The width, in real pixels, a card is *designed* at (scale 1) — inside the
 * Collection's Card view's own 200–280px columns. A card hosted in a
 * ScaledCard is laid out at exactly this width, whatever room it is given.
 */
export const CARD_DESIGN_WIDTH = 240;

export interface ScaledCardProps {
  /** The design width the child card lays out at; defaults to CARD_DESIGN_WIDTH. */
  designWidth?: number;
  className?: string;
  /** One card (a NoteCard), rendered exactly as the Collection view renders it. */
  children: ReactNode;
}

/**
 * Renders one unmodified card as a scaled miniature (or enlargement): the card
 * lays out at its design width — same padding, gap, cover height, type, icon
 * and preview as in the Collection view — and the whole composition is
 * `transform: scale()`d to the width this cell has. Nothing inside is made
 * "responsive"; the card has one design and this only picks the scale.
 *
 * The same model DocumentPreview uses for its Markdown canvas (a fixed canvas,
 * a measured plain-number scale — not CSS math, which the Tauri webview may
 * drop), applied one level up. The two compose: DocumentPreview measures
 * `clientWidth`, which transforms don't affect, so it still sees the design
 * width and keeps its own scale.
 *
 * The cell keeps the card's aspect ratio, so its height follows the scale and
 * the grid lays out the real (scaled) size. The card stays the single
 * interactive target; real-pixel focus ring is kept (see ScaledCard.css).
 */
export function ScaledCard({
  designWidth = CARD_DESIGN_WIDTH,
  className,
  children,
}: ScaledCardProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const cell = cellRef.current;
    if (!cell) {
      return;
    }
    const measure = () => {
      if (cell.clientWidth > 0) {
        setScale(cell.clientWidth / designWidth);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [designWidth]);

  return (
    <div
      ref={cellRef}
      className={['scaled-card', className].filter(Boolean).join(' ')}
    >
      <div
        className="scaled-card__canvas"
        style={
          {
            width: designWidth,
            ...(scale === null
              ? { visibility: 'hidden' }
              : { '--scaled-card-scale': scale }),
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
