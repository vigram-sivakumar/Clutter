import type { HTMLAttributes, ReactNode } from 'react';
import './SettingsSection.css';

export interface SettingsSectionProps extends HTMLAttributes<HTMLElement> {
  /** Shown once, above every group in the section. */
  title: string;
  /** `SettingsGroup`s, stacked as separate cards with a small gap between them. */
  children: ReactNode;
}

/**
 * Several `SettingsGroup`s under one title. Each group stays its own card (its own dividers and background);
 * the section only adds the title and the gap between the cards. A page's groups are 24px apart; the groups of
 * one section are 12px apart, so they read as one set.
 */
export function SettingsSection({ title, children, className, ...props }: SettingsSectionProps) {
  return (
    <section {...props} className={['settings-section', className].filter(Boolean).join(' ')}>
      <span className="settings-group__title">{title}</span>
      <div className="settings-section__groups">{children}</div>
    </section>
  );
}
