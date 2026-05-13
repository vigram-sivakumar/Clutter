import { Avatar } from './Avatar';
import { Button, BUTTON_ELLIPSIS_TARGET_CLASS } from './Button';
import { CustomIcons } from '../design-system/icons';

const WORKSPACE_NAME = 'My space';

export function GlobalTopbar() {
  return (
    <header className="clutter-global-topbar">
      <div className="clutter-global-topbar__workspace" role="region" aria-label="Workspace">
        <Button
          type="button"
          variant="ghost"
          caret
          contentAlign="start"
          className="clutter-global-topbar__workspace-btn"
          aria-haspopup="menu"
          aria-expanded={false}
          aria-label={`Workspace: ${WORKSPACE_NAME}`}
        >
          <Avatar name={WORKSPACE_NAME} size="large" aria-hidden />
          <span className={BUTTON_ELLIPSIS_TARGET_CLASS}>{WORKSPACE_NAME}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          iconOnly={CustomIcons.MagnifyingGlass}
          className="clutter-global-topbar__search"
          aria-label="Search"
        />
      </div>
      <div className="clutter-global-topbar__main">
        <nav className="clutter-global-topbar__nav" aria-label="Editor navigation">
          <Button
            type="button"
            variant="ghost"
            iconOnly={CustomIcons.Sidebar}
            aria-label="Toggle side panel"
          />
          <div className="clutter-global-topbar__history">
            <Button
              type="button"
              variant="ghost"
              iconOnly={CustomIcons.ArrowLeft}
              aria-label="Back"
            />
            <Button
              type="button"
              variant="ghost"
              iconOnly={CustomIcons.ArrowRight}
              aria-label="Forward"
            />
          </div>
        </nav>
        <div className="clutter-global-topbar__actions">
          <Button
            type="button"
            variant="ghost"
            iconOnly={CustomIcons.ChevronDown}
            aria-label="Open menu"
          />
          <Button
            type="button"
            variant="ghost"
            iconOnly={CustomIcons.Tabs}
            aria-label="Tabs"
          />
        </div>
      </div>
    </header>
  );
}
