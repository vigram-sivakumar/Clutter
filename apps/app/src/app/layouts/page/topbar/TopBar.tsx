import { ReactNode } from 'react';
import './TopBar.css';

interface TopBarProps {
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function TopBar({ leading, trailing }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="topbar--leading">{leading}</div>
      <div className="topbar--trailing">{trailing}</div>
    </div>
  );
}
