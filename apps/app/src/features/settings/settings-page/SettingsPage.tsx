import type { HTMLAttributes, ReactNode } from 'react';
import './SettingsPage.css';

export interface SettingsPageProps extends HTMLAttributes<HTMLDivElement> {
  /** Absent: the page shows only its description. */
  title?: string;
  description?: string;
  children?: ReactNode;
}

export function SettingsPage({
  title,
  description,
  children,
  className,
  ...props
}: SettingsPageProps) {
  return (
    <div
      {...props}
      className={['settings-page', className].filter(Boolean).join(' ')}
    >
      <header className="settings-page__header">
        {title && <h1 className="settings-page__title">{title}</h1>}
        {description && (
          <p className="settings-page__description">{description}</p>
        )}
      </header>
      <div className="settings-page__divider" />
      <div className="settings-page__content">{children}</div>
    </div>
  );
}
