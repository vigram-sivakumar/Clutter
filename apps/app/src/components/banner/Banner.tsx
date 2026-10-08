import type { ReactNode } from 'react';
import './Banner.css';

interface BannerProps {
  message?: string;
  actions?: ReactNode;
}

export function Banner({ message, actions }: BannerProps) {
  return (
    <div className="banner">
      {message && <div className="banner__message">{message}</div>}
      {actions && <div className="banner__actions">{actions}</div>}
    </div>
  );
}
