/**
 * Shared dropdown/floating menu styles
 *
 * Provides consistent styling for all floating UI components:
 * - Container appearance (background, border, shadow, radius)
 * - Custom scrollbar styling
 * - Common layout properties
 */

import { sizing } from '../tokens/sizing';
import { spacing } from '../tokens/spacing';

interface Colors {
  background: {
    default: string;
    secondary: string;
  };
  border: {
    default: string;
    focus: string;
  };
  shadow: {
    md: string;
  };
}

/**
 * Get base container styles for dropdown/floating menus
 */
export const getDropdownContainerStyles = (colors: Colors) => ({
  backgroundColor: colors.background.secondary,
  border: `1px solid ${colors.border.default}`,
  borderRadius: sizing.radius.lg,
  boxShadow: `0 ${spacing['6']} ${spacing['16']} ${colors.shadow.md}`,
  padding: spacing['4'],
  overflowY: 'auto' as const,
  overflowX: 'hidden' as const,
  scrollBehavior: 'smooth' as const,
});

/**
 * Get custom scrollbar CSS for dropdowns
 * Returns a CSS string to be injected via <style> tag
 */
export const getDropdownScrollbarCSS = (
  colors: Colors,
  className = 'dropdown-container'
) => `
  .${className} {
    scrollbar-width: thin;
    scrollbar-color: ${colors.border.default} transparent;
  }
  .${className}::-webkit-scrollbar {
    width: 6px;
  }
  .${className}::-webkit-scrollbar-track {
    background: transparent;
  }
  .${className}::-webkit-scrollbar-thumb {
    background-color: ${colors.border.default};
    border-radius: 3px;
  }
  .${className}::-webkit-scrollbar-thumb:hover {
    background-color: ${colors.border.focus};
  }
`;

/**
 * Get transition styles for position changes
 */
export const getDropdownTransitionStyles = (position: {
  top?: number;
  bottom?: number;
}) => ({
  transition:
    position.top !== undefined
      ? 'top 200ms cubic-bezier(0.4, 0, 0.2, 1), max-height 200ms cubic-bezier(0.4, 0, 0.2, 1)'
      : 'bottom 200ms cubic-bezier(0.4, 0, 0.2, 1), max-height 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  willChange:
    position.top !== undefined ? 'top, max-height' : 'bottom, max-height',
});
