import '../styles/page-cover.css';

type PageCoverProps = {
  src?: string;
};

export function PageCover({ src }: PageCoverProps) {
  if (!src) {
    return null;
  }

  return <img src={src} className="page-cover__image" alt="" />;
}
