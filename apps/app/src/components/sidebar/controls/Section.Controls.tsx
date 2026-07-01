import './Sidebar.Controls.css';
import { Button } from '../../button/Button';
import { Icons } from '../../../design-system/icons';

export function Controls() {
  return (
    <div className="controls">
      <div className="sidebar-toggle">
        <Button isIconOnly size="medium" variant="ghost">
          <Icons.Sidebar />
        </Button>
      </div>
      <div className="history-controls">
        <Button isIconOnly size="medium" variant="ghost">
          <Icons.ArrowLeft />
        </Button>
        <Button isIconOnly size="medium" variant="ghost">
          <Icons.ArrowRight />
        </Button>
      </div>
    </div>
  );
}
