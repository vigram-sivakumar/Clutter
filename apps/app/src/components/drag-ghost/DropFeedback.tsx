import { createPortal } from 'react-dom';
import './DropFeedback.css';

/** What to draw: nothing, a highlight over a whole row ("into this"), or a line at a boundary ("between"). */
export type DropFeedbackShape =
  | { readonly kind: 'inside'; readonly rect: { top: number; left: number; width: number; height: number } }
  | { readonly kind: 'insert'; readonly line: { y: number; left: number; width: number } };

/**
 * The one drop-target indicator of a drag, as a single fixed, non-interactive overlay positioned from
 * geometry. One element means two indicators can never show at once, and because it is drawn over the
 * rows rather than styling them, hover, selection and expansion styles cannot conflict with it.
 */
export function DropFeedback({ shape }: { readonly shape: DropFeedbackShape }) {
  const style =
    shape.kind === 'inside'
      ? { top: shape.rect.top, left: shape.rect.left, width: shape.rect.width, height: shape.rect.height }
      : { top: shape.line.y, left: shape.line.left, width: shape.line.width };

  return createPortal(
    <div
      className={shape.kind === 'inside' ? 'drop-feedback drop-feedback--inside' : 'drop-feedback drop-feedback--insert'}
      data-drop-feedback={shape.kind}
      aria-hidden="true"
      style={style}
    />,
    document.body
  );
}
