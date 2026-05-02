import { Icons } from '../design-system/icons';
import { SidepanelNavigation } from './sidepanel/Navigation';

export function Topbar() {
  return (
    <header className="clutter-global-topbar">
      <div
        className="clutter-global-topbar__nav-preview"
        aria-label="SidepanelNavigation preview (dev)"
      >
        <SidepanelNavigation label="Calendar" icon={Icons.CalendarBlank} />
        <SidepanelNavigation label="Notes" icon={Icons.Book} count={16} />
        <SidepanelNavigation label="Disabled" icon={Icons.Bell} disabled />
      </div>
    </header>
  );
}
