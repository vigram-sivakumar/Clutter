/**
 * MarkerContainer - 24×24px container for list markers
 *
 * Used by ListBlock for bullets, checkboxes, numbers, toggle carets.
 * Centers content (16px icons) within fixed dimensions.
 *
 * Fixed geometry:
 * - Width: 24px (sizing.markerContainer)
 * - Height: 24px (sizing.lineHeight)
 * - Content: 16px icons centered
 * - No margin - parent uses gap for spacing
 */

import { sizing } from '../../../tokens';

interface MarkerContainerProps {
  children?: React.ReactNode;
}

export function MarkerContainer({ children }: MarkerContainerProps) {
  return (
    <div
      contentEditable={false}
      style={{
        width: sizing.markerContainer,
        height: sizing.lineHeight,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        // No marginRight - parent container uses gap for spacing
      }}
    >
      {children}
    </div>
  );
}
