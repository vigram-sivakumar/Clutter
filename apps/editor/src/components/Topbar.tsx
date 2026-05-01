import { Icons } from "../design-system/icons";

export function Topbar() {
  return (
    <header className="clutter-topbar">
      {/* Left: workspace switcher (240px, matches sidebar) */}
      <div className="topbar-left">
        <div className="topbar-avatar">MS</div>
        <span className="topbar-workspace-name">My space</span>
        <Icons.CaretDown className="topbar-workspace-caret" size={8} />
        <div className="topbar-divider" />
        <button className="icon-btn" aria-label="Search">
          <Icons.MagnifyingGlass size={16} />
        </button>
      </div>

      {/* Right: navigation + actions */}
      <div className="topbar-right">
        <div className="topbar-right-left">
          <button className="icon-btn" aria-label="Toggle sidebar">
            <Icons.Columns size={16} />
          </button>
          <button className="icon-btn" aria-label="Navigate back">
            <Icons.ArrowLeft size={16} />
          </button>
          <button className="icon-btn" aria-label="Navigate forward">
            <Icons.ArrowRight size={16} />
          </button>
        </div>

        <div className="topbar-right-right">
          <button className="icon-btn" aria-label="Search">
            <Icons.MagnifyingGlass size={16} />
          </button>
          <button className="icon-btn" aria-label="Star">
            <Icons.Star size={16} />
          </button>
          <button className="icon-btn" aria-label="Share">
            <Icons.ArrowSquareOut size={16} />
          </button>
          <button className="icon-btn" aria-label="More options">
            <Icons.DotsThree size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
