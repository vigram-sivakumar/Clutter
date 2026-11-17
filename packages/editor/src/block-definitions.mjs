// Shared insertion configuration. UI controls choose IDs; they do not own policy.
const textPolicy = Object.freeze({
  empty: 'convert',
  nonEmpty: 'after',
  focus: 'inserted',
});
const objectPolicy = Object.freeze({
  empty: 'before',
  nonEmpty: 'after',
  focus: 'retain',
});
const specs = [
  {
    id: 'paragraph',
    label: 'Paragraph',
    terms: ['paragraph', 'text', 'p'],
    nodeType: 'paragraph',
    attrs: {},
    insertion: textPolicy,
  },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    id: 'heading-' + level,
    label: 'Heading ' + level,
    terms: ['heading ' + level, 'heading' + level, 'h' + level],
    nodeType: 'heading',
    attrs: { level },
    insertion: textPolicy,
  })),
  {
    id: 'ordered-list',
    label: 'Ordered list',
    terms: ['ordered list', 'numbered list', 'ol', 'list'],
    nodeType: 'list_item',
    attrs: { listStyle: 'ordered' },
    insertion: textPolicy,
  },
  {
    id: 'unordered-list',
    label: 'Unordered list',
    terms: ['unordered list', 'bullet list', 'ul', 'list'],
    nodeType: 'list_item',
    attrs: { listStyle: 'unordered' },
    insertion: textPolicy,
  },
  {
    id: 'separator',
    label: 'Separator',
    terms: ['separator', 'divider', 'line'],
    nodeType: 'separator',
    attrs: {},
    insertion: objectPolicy,
  },
];
/** Per-command workspace prop, e.g. {'heading-2': {focus:'retain'}}. */
export function createBlockDefinitions(insertionPolicies = {}) {
  if (
    !insertionPolicies ||
    typeof insertionPolicies !== 'object' ||
    Array.isArray(insertionPolicies)
  )
    throw Error('INVALID_INSERTION_POLICIES');
  const ids = new Set(specs.map((s) => s.id));
  if (Object.keys(insertionPolicies).some((id) => !ids.has(id)))
    throw Error('UNKNOWN_BLOCK_POLICY');
  return Object.freeze(
    specs.map((spec) => {
      const override = Object.hasOwn(insertionPolicies, spec.id)
        ? insertionPolicies[spec.id]
        : {};
      if (
        !override ||
        typeof override !== 'object' ||
        Array.isArray(override) ||
        Object.keys(override).some(
          (k) => !['empty', 'nonEmpty', 'focus'].includes(k)
        )
      )
        throw Error('INVALID_INSERTION_POLICY');
      const insertion = { ...spec.insertion, ...override };
      if (
        !['convert', 'before', 'after'].includes(insertion.empty) ||
        !['before', 'after'].includes(insertion.nonEmpty) ||
        !['inserted', 'retain'].includes(insertion.focus)
      )
        throw Error('INVALID_INSERTION_POLICY');
      return Object.freeze({
        ...spec,
        terms: Object.freeze([...spec.terms]),
        attrs: Object.freeze({ ...spec.attrs }),
        insertion: Object.freeze(insertion),
      });
    })
  );
}
export const blockDefinitions = createBlockDefinitions();
