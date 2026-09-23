import { Button } from '@components/button/Button';
import './Page.Cover.css';
import { AppIcon } from '@shared/icon';

type PageCoverProps = {
  src?: string;
};

export function PageCover({ src }: PageCoverProps) {
  if (!src) {
    return null;
  }

  return (
    <aside className="page__cover">
      <Button className="page__cover__change" size="small" isIconOnly>
        <AppIcon icon="moreVertical" />
      </Button>
      <img src={src} className="page-cover__image" alt="" />
    </aside>
  );
}
