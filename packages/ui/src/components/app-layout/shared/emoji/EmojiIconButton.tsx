import { useRef, ReactNode } from 'react';
import { Note } from '../../../../icons';
import { TertiaryButton } from '../../../ui-buttons';
import { useTheme } from '../../../../hooks/useTheme';

interface EmojiIconButtonProps {
  emoji: string | null | undefined;
  onClick: (buttonRef: HTMLButtonElement) => void;
  size?: 'xs' | 'small' | 'medium' | 'large'; // Button size
  iconSize?: number; // Icon size (for default icon)
  iconColor?: string; // Custom color for default icon
  isSelected?: boolean; // For sidebar selected state
  defaultIcon?: ReactNode; // Custom default icon (defaults to Note icon)
}

export const EmojiIconButton = ({
  emoji,
  onClick,
  size = 'xs',
  iconSize = 16,
  iconColor,
  isSelected = false,
  defaultIcon,
}: EmojiIconButtonProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { colors } = useTheme();

  const defaultIconColor =
    iconColor || (isSelected ? colors.text.default : colors.text.secondary);

  // Dynamic emoji size: 32px for large (page titles), 16px for others (inline)
  const emojiSize = size === 'large' ? '32px' : '16px';

  // Render emoji as a custom icon wrapper or use provided defaultIcon or fallback to Note icon
  const icon = emoji ? (
    <span style={{ fontSize: emojiSize, lineHeight: 1 }}>{emoji}</span>
  ) : defaultIcon ? (
    defaultIcon
  ) : (
    <Note size={iconSize} style={{ color: defaultIconColor }} />
  );

  return (
    <div ref={buttonRef as any} style={{ display: 'inline-flex' }}>
      <TertiaryButton
        icon={icon}
        onClick={(e) => {
          e.stopPropagation();
          if (buttonRef.current) {
            onClick(buttonRef.current as unknown as HTMLButtonElement);
          }
        }}
        size={size}
      />
    </div>
  );
};
