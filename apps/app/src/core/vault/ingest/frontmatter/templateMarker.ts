import {
  addCustomProperty,
  readCustomProperties,
  type CustomFrontmatterProperty,
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

/**
 * Whether `property` is the template marker itself (`kind: template`) —
 * Clutter's own bookkeeping, not something the user wrote, so the Properties
 * list leaves it out. A user's own `kind` (any other value) is ordinary data
 * and stays visible.
 */
export function isTemplateMarkerProperty(property: CustomFrontmatterProperty): boolean {
  return (
    property.key === TEMPLATE_MARKER_KEY &&
    property.type === 'text' &&
    property.value === TEMPLATE_MARKER_VALUE
  );
}

/** The custom properties the Properties list shows: every one except the template marker. */
export function readVisibleCustomProperties(lines: readonly string[]): CustomFrontmatterProperty[] {
  return readCustomProperties(lines).filter((property) => !isTemplateMarkerProperty(property));
}
