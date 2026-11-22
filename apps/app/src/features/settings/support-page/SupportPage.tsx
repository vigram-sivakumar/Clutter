import { Button } from '@components/button/Button';
import './SupportPage.css';

const CONTRIBUTIONS = [
  {
    name: 'Thanks',
    amount: '$5',
    description: 'A small gesture that keeps the project moving.',
  },
  {
    name: 'Boost',
    amount: '$15',
    description: 'A little more room to improve Clutter.',
    featured: true,
  },
  {
    name: 'Believer',
    amount: '$30',
    description: 'A generous show of support for independent software.',
  },
];

/** A local, informational page for supporting Clutter. Payment setup is intentionally not connected yet. */
export function SupportPage() {
  return (
    <div className="support-page">
      <section className="support-page__contributions">
        <div className="support-page__section-heading">
          <h2>Choose your support</h2>
          <p>Every contribution is optional and made just once.</p>
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
              <h3>{contribution.name}</h3>
              <p className="support-page__description">{contribution.description}</p>
              <div className="support-page__price">
                <span className="support-page__amount-value">{contribution.amount}</span>
                <span className="support-page__frequency">one-time</span>
              </div>
              <Button
                className="support-page__button"
                variant="outline-fill"
                size="large"
                disabled
              >
                Coming soon
              </Button>
            </article>
          ))}
        </div>
        <p className="support-page__custom">
          Want to contribute a different amount? A custom option will be available too.
        </p>
      </section>

      <section className="support-page__note">
        <h2>Free for everyone, always.</h2>
        <p>
          Supporting Clutter won't unlock features or change how the app works. There are no
          subscriptions or recurring payments — just an optional way to help keep development going.
        </p>
      </section>
    </div>
  );
}
