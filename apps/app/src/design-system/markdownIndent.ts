/**
 * Markdown indentation metrics derived from the design token system.
 *
 * The canonical indentation model is 4 spaces per level. The `--md-indent`
 * CSS custom property defines one indentation level in pixels; individual
 * space width is automatically one quarter of that.
 *
 * These values are read once at initialization and cached, rather than
 * queried via getComputedStyle() for every character. Theme/token changes
 * require an explicit refresh via refreshMarkdownIndent().
 */

let cachedIndentLevelPx: number | null = null;

/**
 * Reads the `--md-indent` CSS custom property from the root element and
 * parses it to a numeric pixel value. Caches the result for reuse.
 *
 * The property is expected to be a CSS length value (e.g., "24px").
 * If the property is missing or cannot be parsed, falls back to 24px
 * (the current design-system default).
 */
function readMarkdownIndent(): number {
  if (cachedIndentLevelPx !== null) {
    return cachedIndentLevelPx;
  }

  const root = document.documentElement;
  const computed = getComputedStyle(root).getPropertyValue('--md-indent').trim();

  // Parse "24px" -> 24, or fall back to 24 if parsing fails.
  const match = computed.match(/^([\d.]+)px$/);
  cachedIndentLevelPx = match ? parseFloat(match[1]!) : 24;

  return cachedIndentLevelPx;
}

/**
 * One indentation level in pixels, derived from `--md-indent`.
 * Used for tab characters and quoted/nested content layout.
 */
export function getIndentLevelPx(): number {
  return readMarkdownIndent();
}

/**
 * One space character's visual width in pixels.
 * Calculated as one quarter of an indentation level (4 spaces = 1 level).
 */
export function getIndentSpacePx(): number {
  return readMarkdownIndent() / 4;
}

/**
 * Refresh cached indentation metrics — call when the design tokens or
 * theme change, so subsequent calls to getIndentLevelPx() and
 * getIndentSpacePx() pick up the new values.
 */
export function refreshMarkdownIndent(): void {
  cachedIndentLevelPx = null;
}
