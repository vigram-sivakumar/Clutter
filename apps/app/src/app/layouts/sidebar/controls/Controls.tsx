import './Controls.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

/**
 * Sidebar-toggle and history (back/forward) controls are intentional
 * placeholders for future sidebar-state and navigation-history features —
 * no backing state exists for either yet. All three stay `disabled` until
 * that state exists; an enabled control with no handler is not an
 * acceptable placeholder (see ADR-016).
 */
export function Controls() {
  return (
    <div className="controls" data-tauri-drag-region>
      <div className="sidebar-toggle">
        <Button isIconOnly size="medium" variant="ghost" disabled>
          <AppIcon icon="sidebar" />
        </Button>
      </div>
      <div className="history-controls">
        <Button isIconOnly size="medium" variant="ghost" disabled>
          <AppIcon icon="arrowLeft" />
        </Button>
        <Button isIconOnly size="medium" variant="ghost" disabled>
          <AppIcon icon="arrowRight" />
        </Button>
      </div>
    </div>
  );
}
