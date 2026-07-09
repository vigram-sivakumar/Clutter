import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

export function Controls() {
  return (
    <div className="controls">
      <div className="sidebar-toggle">
        <Button isIconOnly size="medium" variant="ghost">
          <AppIcon name="sidebar" />
        </Button>
      </div>
      <div className="history-controls">
        <Button isIconOnly size="medium" variant="ghost">
          <AppIcon name="arrowLeft" />
        </Button>
        <Button isIconOnly size="medium" variant="ghost">
          <AppIcon name="arrowRight" />
        </Button>
      </div>
    </div>
  );
}
