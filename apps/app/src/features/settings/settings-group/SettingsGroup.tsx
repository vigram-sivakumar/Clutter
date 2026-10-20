import { HTMLAttributes, ReactNode } from 'react';
import './SettingsGroup.css';

export interface SettingsGroupProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function SettingsGroup({
  title,
  description,
  children,
  className,
  ...props
}: SettingsGroupProps) {
  const entries = Array.isArray(children) ? children : [children];
  return (
    <div
      {...props}
      className={['settings-group', className].filter(Boolean).join(' ')}
    >
      {(title || description) && (
        <header className="settings-group__header">
          <span className="settings-group__title">{title}</span>
          {description && (
            <p className="settings-group__description">{description}</p>
          )}
        </header>
      )}
      <div className="settings-group__entries">
        {entries.map((entry, index) => (
          <div key={index}>
            {index > 0 && <div className="settings-group__divider" />}
            {entry}
          </div>
        ))}
      </div>
    </div>
  );
}
