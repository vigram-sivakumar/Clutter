import type { HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { NESTED_INTERACTIVE_SELECTOR } from '@shared/interaction';
import './SettingsEntry.css';

export interface SettingsEntryProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  /** Extra classes for the title text, e.g. the global `truncate` utility to cut it to one line. */
  titleClassName?: string;
  /** Extra classes for the description text, e.g. the global `truncate` utility. */
  descriptionClassName?: string;
  /**
   * The `id` of the control this entry labels (usually the input in `footer`): the title renders as a
   * `<label htmlFor>` — or the description when there is no title — so assistive tech names the control and a
   * click on the text focuses it.
   */
  labelFor?: string;
  trailing?: ReactNode;
  footer?: ReactNode;
  /**
   * Makes the whole entry clickable (mouse only: no role, tabIndex or key handling). A click that lands on
   * a nested control — a link in the text, a control in the footer or trailing slot — belongs to that
   * control and never fires this.
   */
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

function joinClasses(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

/** A `<label>` when it names a control (`htmlFor`), otherwise a plain `<span>`. */
function TextElement({
  htmlFor,
  className,
  children,
}: {
  htmlFor?: string;
  className: string;
  children: ReactNode;
}) {
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <span className={className}>{children}</span>
  );
}

export function SettingsEntry({
  title,
  description,
  titleClassName,
  descriptionClassName,
  labelFor,
  trailing,
  footer,
  onClick,
  className,
  ...props
}: SettingsEntryProps) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const nested = (event.target as HTMLElement).closest(
      NESTED_INTERACTIVE_SELECTOR
    );
    if (nested && nested !== event.currentTarget) return;
    onClick?.(event);
  }

  return (
    <div
      {...props}
      className={[
        'settings-entry',
        className,
        onClick && 'settings-entry-interactive',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick ? handleClick : undefined}
    >
      <div className="settings-entry__main">
        {(title || description) && (
          <div className="settings-entry__content">
            {title && (
              <TextElement
                htmlFor={labelFor}
                className={joinClasses('settings-entry__title', titleClassName)}
              >
                {title}
              </TextElement>
            )}
            {description && (
              <TextElement
                htmlFor={title ? undefined : labelFor}
                className={joinClasses(
                  'settings-entry__description',
                  descriptionClassName
                )}
              >
                {description}
              </TextElement>
            )}
          </div>
        )}
        {footer && <div className="settings-entry__footer">{footer}</div>}
      </div>
      {trailing && <div className="settings-entry__trailing">{trailing}</div>}
    </div>
  );
}
