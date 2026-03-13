import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../../../../hooks/useTheme';
import { DismissButton } from '../../../../ui-buttons';
import { getTagColor } from '../../../../../utils/tagColors';
import { useTagsStore } from '@clutter/state';
import { radius } from '../../../../../tokens/radius';

interface TagPillProps {
  label: string;
  onRemove?: () => void;
  onClick?: (tag: string) => void; // Direct click for navigation (prioritized over onEdit)
  onEdit?: (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => void;
  onScheduleClose?: () => void;
  maxWidth?: string;
}

export const TagPill = ({ label, onRemove, onClick, onEdit, onScheduleClose, maxWidth = '200px' }: TagPillProps) => {
  const { colors } = useTheme();
  const tagMetadata = useTagsStore((state) => state.getTagMetadata(label));
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get custom color from metadata if set, otherwise use hash-based color
  const colorName = tagMetadata?.color || getTagColor(label);
  const accentColor = colors.accent[colorName as keyof typeof colors.accent];
  const tagColor = (accentColor && 'bg' in accentColor && 'text' in accentColor ? accentColor : colors.accent.default) as { bg: string; text: string };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Prioritize onClick over onEdit - if onClick is provided, use direct click behavior
  const useDirectClick = !!onClick;

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick(label);
    }
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    setIsHovered(true);
    
    // Only use hover behavior if onClick is NOT provided
    if (onEdit && !useDirectClick) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      
      const capturedEvent = {
        clientX: e.clientX,
        clientY: e.clientY,
        currentTarget: e.currentTarget as HTMLElement,
      };
      
      hoverTimeoutRef.current = setTimeout(() => {
        onEdit(capturedEvent);
      }, 200);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    if (onScheduleClose && !useDirectClick) {
      onScheduleClose();
    }
  };

  return (
    <span
      style={{
        display: 'inline-block',
        verticalAlign: 'baseline',
        maxWidth: maxWidth,
      }}
      onClick={useDirectClick ? handleClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        style={{        
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0px 4px',
          borderRadius: radius['3'],
          fontSize: '16px',
          lineHeight: '24px',
          fontWeight: 400,
          backgroundColor: tagColor.bg,
          color: tagColor.text,
          cursor: (onClick || onEdit) ? 'pointer' : 'default',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        } as any}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: '1',
            minWidth: 0,
        }}
      >
        {label}
        </span>
        {onRemove && isHovered && (
          <DismissButton
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            size={16}
            iconSize={12}
          />
        )}
      </span>
    </span>
  );
};

