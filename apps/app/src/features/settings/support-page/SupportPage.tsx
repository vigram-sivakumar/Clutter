import { Button } from '@components/button/Button';
import './SupportPage.css';

const CONTRIBUTIONS = [
  {
    name: 'Thanks',
    amount: '$5',
    description: 'A small thank-you for the work behind Clutter.',
  },
  {
    name: 'Boost',
    amount: '$15',
    description: 'Help make more time for thoughtful improvements.',
    featured: true,
  },
  {
    name: 'Believer',
    amount: '$30',
    description: 'A generous way to keep Clutter moving.',
  },
];

/** A local, informational page for supporting Clutter. Payment setup is intentionally not connected yet. */
export function SupportPage() {
  return (
    <div className="support-page">
      <section className="support-page__contributions">

        <div className="support-page__amounts">
          {CONTRIBUTIONS.map((contribution) => (
            <article
              className={[
                'support-page__amount',
                contribution.featured && 'support-page__amount--featured',
              ]
                .filter(Boolean)
                .join(' ')}
              key={contribution.name}
            >
              {contribution.featured && (
                <span className="support-page__recommendation">A little extra</span>
              )}
              <h3>{contribution.name}</h3>
              <p className="support-page__description">{contribution.description}</p>
              <div className="support-page__price">{contribution.amount}</div>
              <Button
                className="support-page__button"
                variant={contribution.featured ? 'primary' : 'outline-fill'}
                size="large"
                disabled
              >
                Support
              </Button>
            </article>
          ))}
        </div>

        <div className="support-page__custom">
          <div>
            <h3>Something else in mind?</h3>
            <p>Choose a contribution that feels right to you.</p>
          </div>
          <Button variant="outline-fill" size="medium" disabled>
            Set an amount
          </Button>
        </div>
      </section>

      <footer className="support-page__promise">
        <p className="support-page__promise-title">Free for everyone, always.</p>
        <p className="support-page__promise-copy">
          Contributions do not unlock features or change how Clutter works.
        </p>
      </footer>
    </div>
  );
}
