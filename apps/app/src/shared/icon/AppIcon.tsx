import './AppIcon.css';
import { iconRegistry } from './iconRegistry';
import type { SystemIcon } from './types';

const DEFAULT_SIZE = 16;
const DEFAULT_STROKE_WIDTH = 1.5;

export interface AppIconProps {
  icon?: SystemIcon;
  emoji?: string;
  size?: number;
}

export function AppIcon({ icon, emoji, size = DEFAULT_SIZE }: AppIconProps) {
  if (emoji) {
    return <span className="emoji-icon">{emoji}</span>;
  }

  if (!icon) {
    return null;
  }

  const Icon = iconRegistry[icon];

  return <Icon width={size} height={size} strokeWidth={DEFAULT_STROKE_WIDTH} />;
}
