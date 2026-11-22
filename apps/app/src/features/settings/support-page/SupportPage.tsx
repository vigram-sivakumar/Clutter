import { AppIcon } from '@shared/icon';
import './SupportPage.css';

/** A local, informational page for supporting Clutter. Payment setup is intentionally not connected yet. */
export function SupportPage() {
  return (
    <div className="support-page">
      <section className="support-page__hero">
        <div className="support-page__eyebrow">
          <AppIcon icon="heart" />
          <span>Independent software</span>
        </div>
        <h2 className="support-page__headline">Help keep Clutter free.</h2>
        <p className="support-page__intro">
          Clutter is made independently, with a simple idea: a thoughtful place for your notes,
          without subscriptions or feature limits.
        </p>
        <p className="support-page__promise">
          Clutter is free to use. Your support helps us keep improving it for everyone.
        </p>
      </section>

      <section className="support-page__contributions">
        <div className="support-page__section-heading">
          <h2>Support the work</h2>
          <p>Choose a one-time contribution that feels right to you.</p>
        </div>
        <div className="support-page__amounts">
          <article className="support-page__amount">
            <span className="support-page__amount-value">$5</span>
            <span className="support-page__amount-label">A little support</span>
            <p>A small thank-you that helps keep the project moving.</p>
          </article>
          <article className="support-page__amount support-page__amount--featured">
            <span className="support-page__amount-note">A popular choice</span>
            <span className="support-page__amount-value">$15</span>
            <span className="support-page__amount-label">A bigger boost</span>
            <p>More room to spend time improving Clutter.</p>
          </article>
          <article className="support-page__amount">
            <span className="support-page__amount-value">$30</span>
            <span className="support-page__amount-label">A generous boost</span>
            <p>Help support the long-term development of the app.</p>
          </article>
        </div>
        <p className="support-page__custom">
          Prefer another amount? We'll offer a custom contribution option too.
        </p>
      </section>

      <section className="support-page__footer">
        <div className="support-page__footer-icon">
          <AppIcon icon="heart" />
        </div>
        <div>
          <h2>Always free. Always optional.</h2>
          <p>
            Contributions won't unlock features or change how Clutter works. No paid plans,
            no recurring payments — just a way to support independent development.
          </p>
        </div>
      </section>

      <p className="support-page__availability">
        Contributions aren't available yet. We're working on a simple way to support Clutter.
      </p>
    </div>
  );
}
