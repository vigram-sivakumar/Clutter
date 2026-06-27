import { Button } from './Button';
import { Icons } from '../design-system/icons';

export type TopbarProps = {
  /** Wide left column when the docked rail is open. */
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function Topbar({ sidebarOpen, onToggleSidebar }: TopbarProps) {
  return (
    <header className="clutter-topbar">
      <div
        className={[
          'clutter-topbar__sidebar',
          !sidebarOpen && 'clutter-topbar__sidebar--hug',
        ]
          .filter(Boolean)
          .join(' ')}
        role="region"
        aria-label="Sidebar"
      >
        <Button
          type="button"
          variant="ghost"
          iconOnly={Icons.Sidebar}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-expanded={sidebarOpen}
          aria-controls="clutter-sidebar"
          onClick={onToggleSidebar}
        />
      </div>
      <div className="clutter-topbar__main">
        <nav className="clutter-topbar__nav" aria-label="Editor navigation">
          <div className="clutter-topbar__history">
            <Button
              type="button"
              variant="ghost"
              iconOnly={Icons.ArrowLeft}
              aria-label="Back"
            />
            <Button
              type="button"
              variant="ghost"
              iconOnly={Icons.ArrowRight}
              aria-label="Forward"
            />
          </div>
        </nav>
        <div className="clutter-topbar__actions">
          <Button
            type="button"
            variant="ghost"
            iconOnly={Icons.MagnifyingGlass}
            aria-label="Global search"
          />
          <Button
            type="button"
            variant="ghost"
            iconOnly={Icons.Tabs}
            aria-label="Tabs"
          />
          <Button
            type="button"
            variant="ghost"
            iconOnly={Icons.ChevronDown}
            aria-label="Open menu"
            className="clutter-btn--hug"
          />
        </div>
      </div>
    </header>
  );
}
