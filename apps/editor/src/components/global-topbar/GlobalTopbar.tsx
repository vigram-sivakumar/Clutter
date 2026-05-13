import { Button } from '../Button';
import { CustomIcons } from '../../design-system/icons';
import { Workspace } from './Workspace';

export function GlobalTopbar() {
  return (
    <header className="clutter-global-topbar">
      <Workspace name="My space" />
      <div className="clutter-global-topbar__main">
        <nav className="clutter-global-topbar__nav" aria-label="Editor navigation">
          <Button
            type="button"
            variant="ghost"
            iconOnly={CustomIcons.Sidebar}
            className="clutter-global-topbar__icon-btn"
            aria-label="Toggle side panel"
          />
          <div className="clutter-global-topbar__history">
            <Button
              type="button"
              variant="ghost"
              iconOnly={CustomIcons.ArrowLeft}
              className="clutter-global-topbar__icon-btn"
              aria-label="Back"
            />
            <Button
              type="button"
              variant="ghost"
              iconOnly={CustomIcons.ArrowRight}
              className="clutter-global-topbar__icon-btn"
              aria-label="Forward"
            />
          </div>
        </nav>
        <div className="clutter-global-topbar__actions">
          <Button
            type="button"
            variant="ghost"
            iconOnly={CustomIcons.ChevronDown}
            className="clutter-global-topbar__icon-btn"
            aria-label="Open menu"
          />
          <Button
            type="button"
            variant="ghost"
            iconOnly={CustomIcons.Tabs}
            className="clutter-global-topbar__icon-btn"
            aria-label="Tabs"
          />
        </div>
      </div>
    </header>
  );
}
