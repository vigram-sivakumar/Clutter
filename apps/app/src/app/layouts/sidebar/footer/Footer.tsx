import './Footer.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface FooterProps {
  onOpenArchive(): void;
}

export function Footer({ onOpenArchive }: FooterProps) {
  return (
    <div className="footer">
      <div className="footer__actions">
        <Button
          isIconOnly
          size="medium"
          variant="ghost"
          onClick={onOpenArchive}
        >
          <AppIcon icon="archive" />
        </Button>
      </div>
    </div>
  );
}
