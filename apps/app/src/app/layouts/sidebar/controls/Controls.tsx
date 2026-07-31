import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

export function Controls() {
  return (
    <div className="controls" data-tauri-drag-region>
      <div className="sidebar-toggle">
        <Button isIconOnly size="medium" variant="ghost">
          <AppIcon icon="sidebar" />
        </Button>
      </div>
      <div className="history-controls">
        <Button isIconOnly size="medium" variant="ghost" isDisabled>
          <AppIcon icon="arrowLeft" />
        </Button>
        <Button isIconOnly size="medium" variant="ghost" isDisabled>
          <AppIcon icon="arrowRight" />
        </Button>
      </div>
    </div>
  );
}
