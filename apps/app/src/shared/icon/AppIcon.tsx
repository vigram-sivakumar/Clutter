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
}

export function AppIcon({
  icon,
  emoji,
  size = DEFAULT_SIZE,
  slotSize = 20,
}: AppIconProps) {
  const Icon = icon ? iconRegistry[icon] : null;
  const style = {
    '--app-icon-size': `${slotSize}px`,
  } as React.CSSProperties;

  return (
    <span className="app-icon" style={style}>
      {emoji ? (
        <span className="emoji-icon">{emoji}</span>
      ) : Icon ? (
        <Icon width={size} height={size} strokeWidth={DEFAULT_STROKE_WIDTH} />
      ) : null}
    </span>
  );
}
