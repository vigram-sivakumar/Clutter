import './page.Cover.css';

type PageCoverProps = {
  src?: string;
};

export function PageCover({ src }: PageCoverProps) {
  if (!src) {
    return null;
  }

  return (
    <aside className="page__cover">
      <img src={src} className="page-cover__image" alt="" />
    </aside>
  );
}
