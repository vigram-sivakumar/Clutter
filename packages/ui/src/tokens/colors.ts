/**
 * Hybrid color palette
 * Light mode: Minimal editorial aesthetic (clean off-white #fafaf8 with strong black contrast)
 * Dark mode: Notion Calendar aesthetic (true black #000000 base with subtle elevation)
 * Inspired by high-end portfolio, magazine design, and premium productivity apps
 */

// Stone palette for light mode - minimal editorial aesthetic (inspired by high-end portfolios)
const stone = {
  50: '#fafaf8', // Light: clean off-white background (minimal base)
  100: '#f5f5f0', // Light: secondary background (subtle layering)
  200: '#ecece6', // Light: tertiary background, subtle dividers
  300: '#deddd5', // Light: hover background, default border
  400: '#b8b7ae', // Light: disabled text, placeholder
  500: '#8a8980', // Light: tertiary text, markers
  600: '#5c5b52', // Light: secondary text
  700: '#3d3c35', // Light: tags, focus states
  750: '#2f2e28', // Light: hover on dark UI / button hover (NEW - precision shade)
  800: '#26251f', // Light: primary button default
  875: '#1b1a16', // Light: pressed primary (NEW - precision shade)
  900: '#131210', // Light: default text (strong black for editorial contrast)
} as const;

// Neutral palette for dark mode - Notion Calendar aesthetic
const neutral = {
  50: '#D4D4D4', // Dark: default text (light gray, high contrast on black)
  100: '#D4D4D4', // Dark: bright text/highlights
  200: '#a0a0a0', // Dark: tags
  300: '#838383', // Dark: secondary text (medium gray)
  400: '#808080', // Dark: placeholder, subtle elements
  500: '#666666', // Dark: tertiary text, disabled
  600: '#2B2B2B', // Dark: keyboard shortcuts, lighter elements
  700: '#262626', // Dark: subtle borders, elevated surfaces
  750: '#212121', // Dark: hover state (subtle lift)
  800: '#202020', // Dark: buttons/elevated surfaces
  875: '#191919', // Dark: sidebar background (slightly elevated from main)
  900: '#151515', // Dark: main background (near-black)
  950: '#000000', // Dark: true black (deepest level)
} as const;

export const colors = {
  light: {
    // Background colors - Minimal editorial aesthetic
    background: {
      default: stone[50], // clean off-white base
      secondary: stone[100], // subtle layering
      tertiary: stone[200], // soft dividers and sections
      hover: stone[300], // interactive hover state (all surfaces)
      active: stone[300], // pressed/selected/active state
    },

    // Text colors - Strong editorial contrast
    text: {
      default: stone[900], // strong black for readability
      secondary: stone[600], // medium weight for hierarchy
      tertiary: stone[500], // lighter for subtle content, metadata, markers
      disabled: stone[400], // faded/disabled state
      placeholder: `${stone[500]}66`, // placeholder with opacity
      inverse: stone[50], // off-white text on dark backgrounds
    },

    // Border colors - Minimal lines (structural only)
    border: {
      default: stone[300], // default border
      subtle: stone[200], // subtle border / connector line
      focus: stone[700], // focus indicator (keyboard navigation)
      divider: stone[200], // subtle dividers
    },

    // Accent colors - Tag/highlight colors only
    accent: {
      // Gold for favorites/stars
      gold: '#eab308', // yellow-500
      // Tag/highlight colors - paired background and text for accessibility
      default: { bg: stone[200], text: stone[900] },
      gray: { bg: stone[300], text: stone[800] },
      brown: { bg: '#fef3c7', text: '#78350f' }, // amber-100, amber-900
      orange: { bg: '#ffedd5', text: '#9a3412' }, // orange-100, orange-800
      yellow: { bg: '#fef9c3', text: '#854d0e' }, // yellow-100, yellow-800
      green: { bg: '#d1fae5', text: '#065f46' }, // emerald-100, emerald-800
      purple: { bg: '#e9d5ff', text: '#6b21a8' }, // purple-200, purple-800
      pink: { bg: '#fce7f3', text: '#9f1239' }, // pink-100, pink-800
      red: { bg: '#fee2e2', text: '#991b1b' }, // red-100, red-800
    },

    // Semantic colors - adjusted for newspaper aesthetic
    semantic: {
      success: '#059669', // emerald-600
      warning: '#d97706', // amber-600
      error: '#dc2626', // red-600
      info: stone[700], // use dark shade instead of blue
      orange: '#f97316', // orange-500
      calendarAccent: '#FD4E00', // Calendar today/selected highlight
    },

    // Selection colors - block selection, drag selection, multi-select
    selection: {
      default: '#2383e2', // Blue (Notion/Apple selection blue)
    },

    // Button colors - explicit state tokens for solid buttons
    button: {
      primary: {
        background: stone[800], // Primary button default
        backgroundHover: stone[750], // Hover state (darker)
        backgroundActive: stone[875], // Active/pressed state (darkest)
        text: stone[100], // Light text on dark background
      },
      danger: {
        background: 'rgba(220, 38, 38, 0.2)', // red-600 with 20% opacity
        backgroundHover: 'rgba(220, 38, 38, 0.4)', // red-600 with 40% opacity
        text: '#dc2626', // Red text
      },
    },

    // Overlay colors
    overlay: {
      soft: `${stone[900]}14`, // ink overlay at 8% (subtle hover)
      medium: `${stone[900]}1F`, // ink overlay at 12% (active/pressed state)
      default: `${stone[900]}29`, // ink overlay at 16% (default interaction)
      strong: `${stone[900]}66`, // ink overlay at 40% (strong emphasis)
      backdrop: 'rgba(37, 36, 32, 0.5)', // modal backdrop (50% opacity)
    },

    // Shadow colors (for box-shadow) - softer shadows for newspaper aesthetic
    shadow: {
      sm: 'rgba(37, 36, 32, 0.04)',
      md: 'rgba(37, 36, 32, 0.08)',
      lg: 'rgba(37, 36, 32, 0.12)',
    },
  },
  dark: {
    // Background colors - Notion Calendar aesthetic (true black base)
    background: {
      default: neutral[900], // #0a0a0a (near-black, premium feel)
      secondary: neutral[875], // #1a1a1a (sidebar, slightly elevated)
      tertiary: neutral[800], // #242424 (buttons, cards, elevated surfaces)
      hover: neutral[750], // #2a2a2a (hover state, subtle lift)
      active: neutral[600], // #303030 (pressed/active state)
    },

    // Text colors - Notion Calendar hierarchy (high contrast on black)
    text: {
      default: neutral[100], // #e5e5e5 (light gray, high contrast)
      secondary: neutral[300], // #9a9a9a (medium gray)
      tertiary: neutral[500], // #666666 (dim gray, metadata, markers)
      disabled: neutral[500], // #666666 (disabled - clearly inactive)
      placeholder: neutral[600], // placeholder with opacity
      inverse: neutral[900], // dark text on light backgrounds
    },

    // Border colors - Notion Calendar borders (subtle, structural)
    border: {
      default: neutral[700], // #303030 (subtle borders)
      subtle: neutral[750], // #242424 (very subtle dividers)
      focus: neutral[600], // Sky blue (modern, less harsh than VS Code blue)
      divider: neutral[750], // #303030 (subtle dividers)
    },

    // Accent colors - Notion-inspired tag colors
    accent: {
      // Gold for favorites/stars
      gold: '#FFD666', // Notion gold
      // Tag/highlight colors - Notion-inspired with WCAG AA compliance
      default: { bg: '#373737', text: '#E3E2E0' },
      gray: { bg: '#454545', text: '#D4D4D4' },
      brown: { bg: '#4A3228', text: '#D4B59E' },
      orange: { bg: '#4A2D0A', text: '#FFB366' },
      yellow: { bg: '#3D3209', text: '#FFD966' },
      green: { bg: '#1A3D36', text: '#6BC4B0' },
      purple: { bg: '#352450', text: '#C9A8F0' },
      pink: { bg: '#451230', text: '#F28DC1' },
      red: { bg: '#4A1D1D', text: '#FF9999' },
    },

    // Semantic colors - Notion-inspired
    semantic: {
      success: '#4a9b8e', // Notion success green
      warning: '#e6c547', // Notion warning yellow
      error: '#e67c73', // Notion error red
      info: '#3b8ef6', // Notion info blue
      orange: '#FF8C00', // Notion orange
      calendarAccent: '#FD4E00', // Calendar today/selected highlight
    },

    // Selection colors - block selection, drag selection, multi-select
    selection: {
      default: '#2383e2', // Blue (Notion/Apple selection blue)
    },

    // Button colors - explicit state tokens for solid buttons
    button: {
      primary: {
        background: neutral[50], // Primary button default (light in dark mode)
        backgroundHover: neutral[100], // Hover state (brighter)
        backgroundActive: neutral[200], // Active/pressed state (brightest)
        text: neutral[950], // Dark text on light background
      },
      danger: {
        background: 'rgba(230, 124, 115, 0.1)', // Notion error red with 10% opacity
        backgroundHover: 'rgba(230, 124, 115, 0.2)', // Notion error red with 20% opacity
        text: '#e67c73', // Red text
      },
    },

    // Overlay colors - subtle white overlays for interaction on dark
    overlay: {
      soft: 'rgba(255, 255, 255, 0.06)', // Subtle hover overlay (Notion-style)
      medium: 'rgba(255, 255, 255, 0.08)', // Active/pressed state
      default: 'rgba(255, 255, 255, 0.10)', // Default overlay for interaction
      strong: 'rgba(255, 255, 255, 0.15)', // Strong overlay for emphasis
      backdrop: 'rgba(0, 0, 0, 0.7)', // Modal backdrop (70% opacity on true black)
    },

    // Shadow colors (for box-shadow) - subtle depth on near-black
    shadow: {
      sm: 'rgba(0, 0, 0, 0.4)', // Subtle shadow on black
      md: 'rgba(0, 0, 0, 0.5)', // Medium shadow
      lg: 'rgba(0, 0, 0, 0.6)', // Strong shadow for modals
    },
  },
} as const;

export type ColorToken = typeof colors;

// Export the palettes for direct access
export { stone, neutral };
