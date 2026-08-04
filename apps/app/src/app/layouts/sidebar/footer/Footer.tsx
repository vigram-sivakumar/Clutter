import './Footer.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';

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
          <AppIcon icon={getSystemLocationPresentation('archive').icon} />
        </Button>
      </div>
    </div>
  );
}
