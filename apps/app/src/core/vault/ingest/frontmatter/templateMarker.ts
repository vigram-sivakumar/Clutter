import {
  addCustomProperty,
  readCustomProperties,
  removeCustomProperty,
  setCustomScalarValue,
} from './customFrontmatter';

/**
 * The frontmatter line that marks a page living in the reserved Templates
 * folder (ADR-041). `kind`, not `type`: lowercase `type` is a retired owned
 * key the serializer drops on every save, so it could not hold this. `kind`
 * is not owned — it is an ordinary custom property a user may also use for
 * their own purposes, which is why the rule below is so conservative.
 */
export const TEMPLATE_MARKER_KEY = 'kind';
export const TEMPLATE_MARKER_VALUE = 'template';

/**
 * The one rule for the template marker (ADR-041), over a page's raw unowned
 * frontmatter lines. Returns the corrected lines, or `null` when they are
 * already right (so a caller can skip the write entirely).
 *
 * - Inside Templates: no `kind` → `kind: template` is appended; an existing
 *   scalar `kind` (any value) is replaced with `template`; already
 *   `kind: template` → null.
 * - Outside Templates: a `kind` whose value is exactly `template` is
 *   removed; any other `kind` is the user's own and is left alone.
 * - A `kind` that is a list, or a differently-cased key (`Kind`) that would
 *   collide with it, is never touched (null): nothing is mangled or thrown
 *   to satisfy the marker. Every other line stays byte-identical.
 */
export function evaluateTemplateMarker(
  lines: readonly string[],
  inTemplates: boolean
): string[] | null {
  const properties = readCustomProperties(lines);
  const existing = properties.find((property) => property.key === TEMPLATE_MARKER_KEY);
  const collides = properties.some(
    (property) =>
      property.key !== TEMPLATE_MARKER_KEY &&
      property.key.toLowerCase() === TEMPLATE_MARKER_KEY
  );
  const isMarked = existing?.type === 'text' && existing.value === TEMPLATE_MARKER_VALUE;

  if (!inTemplates) {
    return isMarked ? removeCustomProperty(lines, TEMPLATE_MARKER_KEY) : null;
  }

  if (isMarked || collides || existing?.type === 'list') {
    return null;
  }

  return existing
    ? setCustomScalarValue(lines, TEMPLATE_MARKER_KEY, 'text', TEMPLATE_MARKER_VALUE)
    : addCustomProperty(lines, TEMPLATE_MARKER_KEY, {
        type: 'text',
        value: TEMPLATE_MARKER_VALUE,
      });
}
