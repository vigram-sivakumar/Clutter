import { useState } from 'react';
import { Header, type HeaderProps } from './Section.Header';
import './Section.css';

export interface SectionProps extends HeaderProps {
  children?: React.ReactNode;
  hasHeader?: boolean;
  isExpanded?: boolean;
  // Whether the section currently has nothing to show. Computed by the
  // caller from its own data, same reasoning as FavoritesSection's isEmpty —
  // what counts as "empty" differs per consumer. Only affects the initial
  // default shown before the user has ever interacted with this Section
  // instance (see hasBeenToggled below) — Workspace.isSectionExpanded has
  // no way to distinguish "never touched" from "explicitly expanded" (both
  // read as its default `true`), so isEmpty can only safely stand in for
  // that missing default *until* an explicit choice is made, never after.
  isEmpty?: boolean;
  // Must land on an exact target state (`workspace.setSectionExpanded`),
  // not toggle a stored value blindly — see hasBeenToggled below for why.
  onExpandedChange?: (expanded: boolean) => void;
}

export function Section({
  children,
  hasHeader,
  isExpanded = true,
  isEmpty = false,
  onExpandedChange,
  ...headerProps
}: SectionProps) {
  // Once the user has interacted with this Section instance, isEmpty must
  // stop overriding the display — otherwise every render re-applies "empty
  // defaults to collapsed" forever, permanently masking the real stored
  // state no matter how many times it's toggled underneath (confirmed via
  // a scratch repro: 3 clicks, stored state genuinely alternated
  // true/false/true, but the section never once visibly opened). Gating on
  // a local "has this instance been toggled" flag — seeded fresh on every
  // mount, since Workspace itself can't tell a stored "true" apart from an
  // untouched default — is what lets isEmpty be a *default* rather than a
  // standing override.
  const [hasBeenToggled, setHasBeenToggled] = useState(false);
  const effectiveExpanded = isEmpty && !hasBeenToggled ? false : isExpanded;

  const handleExpandToggle = () => {
    setHasBeenToggled(true);
    onExpandedChange?.(!effectiveExpanded);
  };

  return (
    <div className={`section ${effectiveExpanded && 'section--expanded'}`}>
      {hasHeader && (
        <Header
          {...headerProps}
          isExpanded={effectiveExpanded}
          onExpandToggle={handleExpandToggle}
        />
      )}
      {effectiveExpanded && <div className="section__content">{children}</div>}
    </div>
  );
}
