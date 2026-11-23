import type { ReactNode } from 'react';

import { RoundIconButton } from '../button/RoundIconButton';

import './Alert.css';

export interface AlertProps {
  title: string;
  description?: string;
  actionsSlot?: ReactNode;
  isDismissible?: boolean;
  onDismiss?: () => void;
}

/** A compact, reusable in-app alert with optional actions and dismissal. */
export function Alert({
  title,
  description,
  actionsSlot,
  isDismissible = false,
  onDismiss,
}: AlertProps) {
  return (
    <section className="alert" role="status">
      <div className="alert__header">
        <div className="alert__content">
          <div className="alert__title">{title}</div>
          {description && (
            <div className="alert__description">{description}</div>
          )}
        </div>
        {isDismissible && onDismiss && (
          <RoundIconButton
            className="alert__dismiss"
            icon="dismiss"
            aria-label="Dismiss"
            onClick={onDismiss}
          />
        )}
      </div>
      <span className="alert__border" />
      {actionsSlot && <div className="alert__actions">{actionsSlot}</div>}
    </section>
  );
}
