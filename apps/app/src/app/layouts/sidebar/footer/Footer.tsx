import './Footer.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

export function Footer() {
  return (
    <div className="footer">
      <div className="footer__actions">
        <Button isIconOnly size="medium" variant="ghost">
          <AppIcon icon="archive" />
        </Button>
      </div>
    </div>
  );
}
