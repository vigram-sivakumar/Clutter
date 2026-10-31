import './CardDivider.css';

/**
 * A 1px rule across a card, as wide as the space it is given. A generic visual — it knows nothing about
 * settings or when to show; the caller decides both.
 */
export function CardDivider() {
  return <div className="card-divider" role="separator" />;
}
