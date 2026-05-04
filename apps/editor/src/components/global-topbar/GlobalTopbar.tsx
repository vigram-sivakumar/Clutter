import { Workspace } from './workspace';
import { ICON_MEDIUM, Icons } from '../../design-system/icons';

export function GlobalTopbar() {
  return (
    <header className="clutter-global-topbar">
      <Workspace name="My space" />
      <div className="clutter-global-topbar__main">
        <nav className="clutter-global-topbar__nav" aria-label="Editor navigation">
          <button
            type="button"
            className="clutter-global-topbar__icon-btn"
            aria-label="Toggle side panel"
          >
            <Icons.SidebarSimple size={ICON_MEDIUM} weight="regular" />
          </button>
          <div className="clutter-global-topbar__history">
            <button type="button" className="clutter-global-topbar__icon-btn" aria-label="Back">
              <Icons.ArrowLeft size={ICON_MEDIUM} weight="regular" />
            </button>
            <button type="button" className="clutter-global-topbar__icon-btn" aria-label="Forward">
              <Icons.ArrowRight size={ICON_MEDIUM} weight="regular" />
            </button>
          </div>
        </nav>
        <div className="clutter-global-topbar__actions">
          <button
            type="button"
            className="clutter-global-topbar__icon-btn"
            aria-label="Open menu"
          >
            <Icons.CaretDown size={ICON_MEDIUM} weight="regular" />
          </button>
          <button
            type="button"
            className="clutter-global-topbar__icon-btn"
            aria-label="Tabs"
          >
            <Icons.Tabs size={ICON_MEDIUM} weight="regular" />
          </button>
        </div>
      </div>
    </header>
  );
}
