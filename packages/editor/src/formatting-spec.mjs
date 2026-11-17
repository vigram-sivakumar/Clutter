// Shared stored-format vocabulary. Preset IDs, never arbitrary CSS from clients.
export const formatColors = Object.freeze(
  [
    ['gray', '#58636d', '#edf0f2'],
    ['red', '#b42332', '#fde8eb'],
    ['orange', '#a4490b', '#fff0df'],
    ['yellow', '#806000', '#fff7c2'],
    ['green', '#237047', '#e4f4e9'],
    ['blue', '#245fa6', '#e5efff'],
    ['purple', '#7645a3', '#f1e8fa'],
  ].map(([id, text, background]) => Object.freeze({ id, text, background }))
);
export const plainFormats = Object.freeze([
  'bold',
  'italic',
  'underline',
  'strike',
]);
export const colorFormats = Object.freeze(['text_color', 'highlight']);
export const isPreset = (value) =>
  formatColors.some((color) => color.id === value);
export const colorValue = (id, kind) =>
  formatColors.find((color) => color.id === id)?.[kind];
export function validLink(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 8192 ||
    /[\s\u0000-\u001f]/.test(value)
  )
    return false;
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
export function validateFormat(type, attrs = {}, inTitle = false) {
  if (
    !attrs ||
    typeof attrs !== 'object' ||
    Array.isArray(attrs) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(attrs))
  )
    throw Error('INVALID_FORMAT');
  const fields = Object.keys(attrs).sort().join();
  if (inTitle && type !== 'link') throw Error('TITLE_FORMAT_NOT_ALLOWED');
  if (plainFormats.includes(type) && !fields) return;
  if (
    colorFormats.includes(type) &&
    fields === 'preset' &&
    isPreset(attrs.preset)
  )
    return;
  if (type === 'link' && fields === 'href' && validLink(attrs.href)) return;
  throw Error('INVALID_FORMAT');
}
