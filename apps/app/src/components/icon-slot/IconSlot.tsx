import './IconSlot.css';
import { AppIcon, type SystemIcon } from '@shared/icon';

interface IconSlotProps {
  icon?: SystemIcon;
  emoji?: string;
}

export function IconSlot({ icon, emoji }: IconSlotProps) {
  return (
    <div className="icon-slot">
      <AppIcon icon={icon} emoji={emoji} />
    </div>
  );
}
