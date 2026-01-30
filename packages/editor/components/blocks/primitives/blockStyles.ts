/**
 * blockStyles - Shared style utilities for blocks
 *
 * Used by:
 * - renderHTML methods (static HTML generation)
 * - Blocks that need direct style access
 *
 * Pure functions - no React dependencies.
 */

import { spacing, sizing, typography } from '../../../tokens';

/**
 * Get inline style string for renderHTML (TipTap static rendering)
 *
 * @param indent - Indent level (0-based)
 * @param extraIndent - Additional indent in pixels (e.g., toggle indent)
 * @param indentMode - 'padding' for content indent, 'margin' for box indent
 */
export function getBlockContainerStyle(
  indent: number = 0,
  extraIndent: number = 0,
  indentMode: 'padding' | 'margin' = 'padding'
): string {
  const totalIndent = indent * spacing.indent + extraIndent;
  const indentProperty =
    indentMode === 'padding' ? 'padding-left' : 'margin-left';

  return `
    position: relative;
    font-family: ${typography.fontFamily};
    font-size: ${typography.body}px;
    line-height: ${typography.lineHeightRatio};
    ${indentProperty}: ${totalIndent}px;
    width: 100%;
  `
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get marker container styles for renderHTML
 */
export function getMarkerStyle(): string {
  return `
    width: ${sizing.markerContainer}px;
    height: ${sizing.lineHeight}px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  `
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get content area styles for renderHTML
 */
export function getContentStyle(): string {
  return 'flex: 1; min-width: 0;';
}

/**
 * Common style objects for JSX (not for renderHTML)
 */
export const blockStyleObjects = {
  /** Flex row layout for marker + content */
  flexRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.inline,
  } as const,

  /** Base container styles */
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    fontFamily: typography.fontFamily,
    fontSize: `${typography.body}px`,
    lineHeight: typography.lineHeightRatio,
  } as const,

  /** Marker container styles (for JSX) */
  marker: {
    width: `${sizing.markerContainer}px`,
    height: `${sizing.lineHeight}px`,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const,

  /** Content area styles (for JSX) */
  content: {
    flex: 1,
    minWidth: 0,
  } as const,
} as const;
