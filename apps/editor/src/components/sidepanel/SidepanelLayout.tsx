import type { ReactNode } from 'react';

export type SidepanelLayoutProps = {
  /** Icon tab strip (top). */
  tabs: ReactNode;
  /** Optional block below tabs (e.g. calendar). */
  secondaryTop?: ReactNode;
  /** Section title row (e.g. Daily Notes). */
  titleRow?: ReactNode;
  /** Primary navigation list area below title. */
  navigation?: ReactNode;
  /** Scrollable main region (lists, trees). */
  children?: ReactNode;
  /** Bottom action bar (settings, trash). */
  footer?: ReactNode;
};

/**
 * Side panel chrome — Figma Atomic/_sidepanel base (node 303:28617).
 * Slots stay optional except `tabs`; empty slots omit DOM nodes.
 */
export function SidepanelLayout({
  tabs,
  secondaryTop,
  titleRow,
  navigation,
  children,
  footer,
}: SidepanelLayoutProps) {
  const hasTop = Boolean(titleRow ?? navigation);
  /** Divider sits between top cluster and scroll content (Figma). */
  const showDivider = hasTop;

  return (
    <div className="clutter-sidepanel-layout">
      <div className="clutter-sidepanel-layout__tabs">{tabs}</div>
      {secondaryTop !== undefined && secondaryTop !== null ? (
        <div className="clutter-sidepanel-layout__secondary">{secondaryTop}</div>
      ) : null}
      <div className="clutter-sidepanel-layout__scroll">
        {hasTop ? (
          <div className="clutter-sidepanel-layout__top">
            {titleRow !== undefined && titleRow !== null ? (
              <div className="clutter-sidepanel-layout__title">{titleRow}</div>
            ) : null}
            {navigation !== undefined && navigation !== null ? (
              <div className="clutter-sidepanel-layout__navigation">{navigation}</div>
            ) : null}
          </div>
        ) : null}
        {showDivider ? (
          <div className="clutter-sidepanel-layout__divider-wrap" aria-hidden>
            <div className="clutter-divider" />
          </div>
        ) : null}
        <div className="clutter-sidepanel-layout__content">{children}</div>
      </div>
      {footer !== undefined && footer !== null ? (
        <div className="clutter-sidepanel-layout__footer">{footer}</div>
      ) : null}
    </div>
  );
}
