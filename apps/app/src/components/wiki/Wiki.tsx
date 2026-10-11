import { SystemIcon } from '@shared/icon';
import './Wiki.css';
import { AppIcon } from '../../shared/icon/AppIcon';

export interface WikiProps {
  title?: string;
  icon: SystemIcon;
  emoji?: string;
  onClick?: () => {};
}

export function Wiki({ title, icon, emoji }: WikiProps) {
  return (
    <div className="wiki">
      <AppIcon icon={icon} emoji={emoji} />
      <span className="wiki__title">{title}</span>
    </div>
  );
}
