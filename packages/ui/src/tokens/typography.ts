/**
 * Notion-inspired typography tokens
 * Based on Notion's font system
 */

export const typography = {
  // Font families
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace',
  },

  // Font sizes
  fontSize: {
    '10': '10px',
    '12': '12px',
    '14': '14px',
    '16': '16px',
    '18': '18px',
    '20': '20px',
    '24': '24px',
    '30': '30px',
    '36': '36px',
    '48': '48px',
    '60': '60px',
  },

  // Font weights
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line heights
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  // Letter spacing
  letterSpacing: {
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
  },

  // Computed line heights (for alignment)
  // Based on fontSize × lineHeight ratio
  lineHeightPx: {
    xs: '14px', // 12px font line height - used for small headers
    sm: '20px', // 14px font line height - used for inline elements (date, link)
    base: '24px', // 16 × 1.5 = 24px - used for icon/marker alignment
  },

  // Text styles (Notion-specific)
  textStyle: {
    pageTitle: {
      fontSize: '40px',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.03em',
    },
    heading1: {
      fontSize: '30px',
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.02em',
    },
    heading2: {
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: '-0.01em',
    },
    heading3: {
      fontSize: '20px',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    body: {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    bodySmall: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
    },
  },
} as const;

export type TypographyToken = typeof typography;
