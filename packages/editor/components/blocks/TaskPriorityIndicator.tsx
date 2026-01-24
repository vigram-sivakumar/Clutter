/**
 * Task Priority Indicator Component
 * 
 * Displays priority indicators (!, !!, or !!!) for task blocks
 * - Shows 1-3 orange exclamation marks based on priority level
 * - Displays dismiss button on hover
 * - Fixed 24x24px container with overflow for visual consistency
 */

import { useState } from 'react';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { radius } from '@clutter/ui';
import { DismissButton } from '@clutter/ui';

interface TaskPriorityIndicatorProps {
  committedPriority: number;
  previewPriority: number;
  onDismiss: () => void;
}

export function TaskPriorityIndicator({
  committedPriority,
  previewPriority,
  onDismiss,
}: TaskPriorityIndicatorProps) {
  const { colors } = useEditorTheme();
  const [isHovered, setIsHovered] = useState(false);

  // Show preview if typing, otherwise show committed
  const displayPriority = previewPriority > 0 ? previewPriority : committedPriority;

  if (displayPriority <= 0) return null;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        left: 'calc(100% + 8px)', // Start from right edge of block content
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'auto',
        // padding: '8px', // Extend hover area to include dismiss button
        // margin: '-8px', // Compensate padding to keep visual position
      }}
    >
      {/* Fixed 24x24 container for indicators */}
      <div
        style={{
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          overflow: 'visible', // Allow !!! to overflow
          position: 'relative',
        }}
      >
        {Array.from({ length: displayPriority }).map((_, i) => (
          <div
            key={i}
            style={{
              color: colors.semantic.orange,
              fontWeight: 600,
              display: 'inline-block',
              backgroundColor: `${colors.semantic.orange}10`,
              borderRadius: radius['3'],
              padding: '1px 2px',
              marginRight: '-2px',
              transformOrigin: 'center center',
              transform:
                i === 0
                  ? 'rotate(-3deg) translateY(-1px)'
                  : i === 1
                  ? 'rotate(4deg) translateY(1px)'
                  : 'rotate(-2deg) translateY(0px)',
            }}
          >
            !
          </div>
        ))}
      </div>

      {/* Dismiss button - only for committed priority on hover */}
      {committedPriority > 0 && isHovered && <DismissButton onClick={onDismiss} />}
    </div>
  );
}

