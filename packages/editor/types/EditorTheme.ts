/**
 * EditorTheme Contract
 *
 * Defines the minimal theme interface required by @clutter/editor
 * This establishes a contract between editor and theme providers,
 * allowing editor to be theme-agnostic.
 *
 * Implementation:
 * - @clutter/ui implements this interface
 * - Apps inject the theme into editor via props/context
 * - Editor depends only on this interface, not UI package
 */

/**
 * Editor theme color contract
 * Only includes colors that editor components actually use
 */
export interface EditorThemeColors {
  text: {
    default: string;
    secondary: string;
    tertiary: string;
    hover: string;
  };
  background: {
    default: string;
    hover: string;
    tertiary: string;
  };
  border: {
    default: string;
    divider: string;
    focus: string;
  };
  shadow: {
    md: string;
  };
  semantic: {
    orange: string;
  };
}

/**
 * Complete editor theme interface
 * Future: May include typography, spacing overrides, etc.
 */
export interface EditorTheme {
  colors: EditorThemeColors;
  mode: 'light' | 'dark';
}

/**
 * Type guard to check if an object implements EditorTheme
 */
export function isEditorTheme(obj: any): obj is EditorTheme {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.colors &&
    obj.colors.text &&
    obj.colors.background &&
    obj.colors.border &&
    obj.colors.shadow &&
    obj.colors.semantic &&
    (obj.mode === 'light' || obj.mode === 'dark')
  );
}
