import './AppIcon.css';
import { iconRegistry } from './iconRegistry';
import type { SystemIcon } from './types';

const DEFAULT_SIZE = 16;
const DEFAULT_STROKE_WIDTH = 1.2;

export interface AppIconProps {
  icon?: SystemIcon;
  emoji?: string | null;
  size?: number;
  slotSize?: number;
  strokeWidth?: number;
  className?: string;
}

export function AppIcon({
  icon,
  emoji,
  size = DEFAULT_SIZE,
  slotSize = 20,
  strokeWidth,
  className,
}: AppIconProps) {
  const Icon = icon ? iconRegistry[icon] : null;
  // Unless a caller asks for its own stroke width (a large illustration that relies on the scaling, say), the line is
  // 1.2px at every size: drawn in screen pixels, not in the SVG's own units, which would scale it with the icon.
  const hasFixedStroke = strokeWidth === undefined;
  const style = {
    '--app-icon-size': `${slotSize}px`,
  } as React.CSSProperties;

  return (
    // `data-icon` names the icon for CSS that styles one by kind (e.g. the selection tick in a menu row).
    <span
      className={`app-icon${hasFixedStroke ? ' app-icon--fixed-stroke' : ''} ${className || ''}`}
      style={style}
      data-icon={!emoji ? icon : undefined}
    >
      {emoji ? (
        <span className="emoji-icon">{emoji}</span>
      ) : Icon ? (
        <Icon width={size} height={size} strokeWidth={strokeWidth ?? DEFAULT_STROKE_WIDTH} />
      ) : null}
    </span>
  );
}
