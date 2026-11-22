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
    description: 'A generous contribution to independent software.',
  },
];

/** A local, informational page for supporting Clutter. Payment setup is intentionally not connected yet. */
export function SupportPage() {
  return (
    <div className="support-page">
      <section className="support-page__intro">
        <div className="support-page__intro-copy">
          <span className="support-page__eyebrow">INDEPENDENT SOFTWARE</span>
          <h2>Good tools grow with good people.</h2>
          <p>
            Clutter is free for everyone. If it has made a little more room for your thoughts,
            you can help keep it growing.
          </p>
        </div>
        <div className="support-page__art" aria-hidden="true">
          <span className="support-page__art-sheet support-page__art-sheet--back" />
          <span className="support-page__art-sheet support-page__art-sheet--middle" />
          <span className="support-page__art-sheet support-page__art-sheet--front">
            <span />
            <span />
            <span />
          </span>
          <span className="support-page__art-spark support-page__art-spark--one" />
          <span className="support-page__art-spark support-page__art-spark--two" />
        </div>
      </section>

      <section className="support-page__contributions">
        <div className="support-page__section-heading">
          <h2>Choose an amount</h2>
          <p>One-time contributions. No subscriptions, no extra features.</p>
        </div>

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
              <div className="support-page__amount-heading">
                <h3>{contribution.name}</h3>
                <span className="support-page__frequency">ONE-TIME</span>
              </div>
              <p className="support-page__description">{contribution.description}</p>
              <div className="support-page__price">{contribution.amount}</div>
              <Button
                className="support-page__button"
                variant={contribution.featured ? 'primary' : 'outline-fill'}
                size="large"
                disabled
              >
                Support with {contribution.amount}
              </Button>
            </article>
          ))}
        </div>

        <div className="support-page__custom">
          <div>
            <h3>Something else in mind?</h3>
            <p>Choose your own amount when custom contributions are available.</p>
          </div>
          <Button variant="outline-fill" size="medium" disabled>
            Custom amount
          </Button>
        </div>
        <p className="support-page__availability">Contribution checkout is coming soon.</p>
      </section>

      <section className="support-page__promise">
        <div className="support-page__promise-mark" aria-hidden="true">C</div>
        <div>
          <h2>Free for everyone, always.</h2>
          <p>
            Your contribution helps fund Clutter's continued development. It does not unlock
            features or change how the app works.
          </p>
        </div>
      </section>
    </div>
  );
}
