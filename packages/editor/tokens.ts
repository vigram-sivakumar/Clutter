/**
 * Editor Design Tokens
 *
 * Centralized constants for spacing, sizing, and typography.
 * All values in pixels unless otherwise noted.
 */

export const spacing = {
  // Semantic spacing (editor-specific)
  /** Total visual spacing between blocks (gap + margin) */
  block: 8,
  /** Flexbox gap between sibling blocks */
  gap: 8,
  /** Medium gap for more breathing room */
  margin: 2,
  /** Horizontal indent per nesting level (marker 24px + gap 8px) */
  indent: 32,
  /** Gap between marker and text */
  inline: 8,
  /** Visual offset for blocks inside a toggle (independent of hierarchy) */
  toggleIndent: 32,

  // Chrome hover zones (invisible divs that extend block hover area)
  /** Width of left hover zone (invisible hover-only div in left gutter) */
  hoverZoneLeft: 64,
  /** Width of right hover zone (invisible hover-only div in right gutter) */
  hoverZoneRight: 40,

  // Scale-based spacing (matches UI design system for component layouts)
  '0': '0px',
  '2': '2px',
  '4': '4px',
  '6': '6px',
  '8': '8px',
  '12': '12px',
  '16': '16px',
  '20': '20px',
  '24': '24px',
  '32': '32px',
  '40': '40px',
  '48': '48px',
  '64': '64px',
} as const;

export const sizing = {
  /** Width/height of list markers (bullet, checkbox, etc.) */
  marker: 16,
  /** Marker container width (holds 16px marker centered) */
  markerContainer: 24,
  /** Line height in pixels (at body font size) */
  lineHeight: 24,
  /** Icon size within markers */
  icon: 16,

  /** Border radius scale (matches UI design system) */
  radius: {
    none: '0px',
    sm: '3px',
    md: '4px',
    lg: '6px',
    xl: '8px',
    full: '9999px',
  },

  /** Z-index scale (matches UI design system) */
  zIndex: {
    base: 0,
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
} as const;

export const typography = {
  /** Font family stack (system fonts - same as v1) */
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
  /** Body text size */
  body: 16,
  bodySmall: 14,
  label: 12,
  /** Heading sizes */
  Display: 32,
  h1: 32,
  h2: 24,
  h3: 20,
  /** Line height multiplier */
  lineHeightRatio: 1.5,
  /** Font weights */
  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

/**
 * Calculate line height in pixels for a given font size
 */
export function getLineHeight(fontSize: number): number {
  return Math.round(fontSize * typography.lineHeightRatio);
}

/**
 * Calculate indent for a given nesting level
 */
export function getIndent(level: number): number {
  return level * spacing.indent;
}

/**
 * Placeholder text for empty blocks
 * Single source of truth for consistent messaging
 */
export const placeholders = {
  /** Default placeholder shown on empty editor and focused empty blocks */
  default: 'Type / for commands, or start typing...',
  /** Code block placeholder - no slash commands in code blocks */
  codeBlock: 'Type or paste code...',
} as const;

/**
 * Semantic colors for editor elements
 * These should match the values in colors.ts
 */
export const editorColors = {
  /** Divider/border color for HR elements */
  divider: {
    light: '#e9e9e7',
    dark: '#2f2f2f',
  },
  /** Wavy underline color (orange) */
  wavyUnderline: '#FF8C00',
  /** Block selection color (halos, drag selection, multi-select) */
  selection: {
    light: '#2383e2', // Blue (matches Notion/Apple selection blue)
    dark: '#2383e2', // Same blue for dark mode
  },
} as const;

/**
 * Reusable SVG patterns for decorative elements
 * Single source of truth for consistent visuals across components
 */
export const patterns = {
  /**
   * Smooth S-curve wave pattern using cubic bezier curves
   * Used by: WavyUnderline mark, HorizontalRule (wavy style)
   *
   * Geometry: viewBox 16x6, stroke-width 1.2
   * The pattern tiles seamlessly at 16px intervals
   */
  wave: {
    /** SVG path for the wave curve */
    path: 'M0 3 C4 3, 4 1, 8 1 S12 3, 16 3',
    /** ViewBox dimensions */
    viewBox: '0 0 16 6',
    /** Pattern tile width */
    width: 16,
    /** Pattern tile height */
    height: 6,
    /** Stroke width for the wave line */
    strokeWidth: 1.2,
  },
} as const;

/**
 * Generate a wave SVG data URL with a specific color
 * @param color - Hex color (e.g., '#FF8C00')
 * @returns CSS url() value for background-image
 */
export function getWaveSvg(color: string): string {
  const { path, viewBox, strokeWidth } = patterns.wave;
  // URL-encode the # in hex color
  const encodedColor = color.replace('#', '%23');
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'%3E%3Cpath d='${path}' fill='none' stroke='${encodedColor}' stroke-width='${strokeWidth}' stroke-linecap='round'/%3E%3C/svg%3E")`;
}

/**
 * Get CSS properties for applying a wave pattern as background
 * @param color - Hex color for the wave
 * @returns Object with CSS properties
 */
export function getWaveStyles(color: string): {
  backgroundImage: string;
  backgroundRepeat: string;
  backgroundPosition: string;
  backgroundSize: string;
} {
  const { width, height } = patterns.wave;
  return {
    backgroundImage: getWaveSvg(color),
    backgroundRepeat: 'repeat-x',
    backgroundPosition: '0 100%',
    backgroundSize: `${width}px ${height}px`,
  };
}
