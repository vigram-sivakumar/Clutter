import { SystemIcon } from '@shared/icon';
import './Wiki.css';
import { AppIcon } from '../../shared/icon/AppIcon';

export interface WikiProps {
  title?: string;
  icon: SystemIcon;
  emoji?: string;
  iconSize?: number;
  /** Class for the icon (passed to AppIcon), e.g. to size the emoji from CSS. */
  className?: string;
  onClick?: () => {};
}

export function Wiki({ title, icon, emoji, iconSize, className }: WikiProps) {
  return (
    <div className="wiki">
      <div className="wiki__icon-slot">
        <AppIcon
          className={className}
          icon={icon}
          emoji={emoji}
          size={iconSize}
        />
      </div>
      <span className="wiki__title">{title}</span>
    </div>
  );
}
