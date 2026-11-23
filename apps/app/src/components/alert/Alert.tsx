import type { ReactNode } from 'react';
import './Alert.css';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

export interface AlertProps {
  title: string;
  description?: string;
  actionsSlot?: ReactNode;
  isDismissible?: boolean;
  isCollapsed?: boolean;
  onDismiss?: () => void;
}

/** A compact, reusable in-app alert with optional actions and dismissal. */
export function Alert({
  title,
  description,
  actionsSlot,
  isDismissible = false,
  isCollapsed = false,
  onDismiss,
}: AlertProps) {
  return (
    <section
      className={`alert${isCollapsed ? ' alert--collapsed' : ''}`}
      role="status"
    >
      <div className="alert__header">
        <div className="alert__content">
          <div className="alert__title">{title}</div>
        </div>
        {isDismissible && onDismiss && (
          <Button
            className="alert__dismiss"
            isIconOnly
            size="small"
            interaction="subtle"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            <AppIcon icon="dismiss" />
          </Button>
        )}
      </div>
      <div className="alert__details">
        {description && <div className="alert__description">{description}</div>}
        <span className="alert__border" />
        {actionsSlot && <div className="alert__actions">{actionsSlot}</div>}
      </div>
    </section>
  );
}
