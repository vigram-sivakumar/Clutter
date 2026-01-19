/**
 * @clutter/ui - Design System & Components
 *
 * This package contains:
 * - Design tokens (colors, spacing, typography, etc.)
 * - Reusable UI components
 * - Application layout components
 * - Icons
 *
 * Dependencies: @clutter/domain, @clutter/state, @clutter/shared
 *
 * ⚠️ Note: This package currently exports many components.
 * In production, consider limiting public exports to only what apps need.
 *
 * Public API: All exports below are public.
 * Internal files (e.g., /internal/ directories) should not be imported directly.
 */

// ============================================
// DESIGN TOKENS
// ============================================
export * from './tokens/colors';
export * from './tokens/theme';
export * from './tokens/spacing';
export * from './tokens/radius';
export * from './tokens/typography';
export * from './tokens/sizing';
export * from './tokens/interactions';
export * from './tokens/animations';
export * from './tokens/transitions';

// ============================================
// HOOKS
// ============================================
export * from './hooks/useTheme';
export * from './hooks/useUIPreferences';

// ============================================
// ICONS
// ============================================
export * from './icons';

// ============================================
// COMPONENTS
// ============================================
// Note: This exports the entire component tree.
// Apps typically only use a small subset (ThemeProvider, NotesContainer, etc.)
export * from './components';

// ============================================
// UTILITIES
// ============================================
export * from './utils/tagColors';
