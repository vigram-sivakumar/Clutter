// ICON_MEDIUM is the single source of truth for the default icon size.
// It is injected as --icon-medium CSS variable in main.tsx so both CSS and components stay in sync.
// To change the global icon size, update ICON_MEDIUM here only.

/** Default stroke width in SVG user units (icons use a 16×16 viewBox). Injected as `--clutter-icon-stroke-user` in main.tsx; SVGR paths use `stroke-width="var(--clutter-icon-stroke-user, 1.2)"` where the design uses the standard weight. */
export const ICON_STROKE_USER = 1.2;

export const ICON_SMALL = 12;
export const ICON_MEDIUM = 16;
/** Sidepanel nav icon frame; keep in sync with `tokens.css` `--height-sm`. */
export const ICON_WRAPPER_SIZE = 20;
export const ICON_EXTRA_LARGE = 48;
export const ICON_SMALL_WRAPPER = 12;
export const ICON_MEDIUM_WRAPPER = 20;

/** Calendar / pill status dot (Phosphor `Circle` fill). Injected as `--dot-md` in main.tsx. */
export const DOT_MD = 8;
