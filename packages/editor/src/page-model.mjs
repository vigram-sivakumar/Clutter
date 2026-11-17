import { validateFormat, isPreset } from './formatting-spec.mjs';
// Canonical page validation and deterministic fragment replacement.
import { plainTitle } from '../../core/src/page-fields.ts';
import { initProseMirrorDoc, updateYFragment } from 'y-prosemirror';
import { noteSchema, taskSchema, parse } from './schema.mjs';
const keys = (value, expected) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== expected.split(',').sort().join()
  )
    throw Error('INVALID_FIELDS');
};
const id = (s) => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
function properties(p) {
  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    Object.keys(p).length > 64
  )
    throw Error('INVALID_PROPERTIES');
  for (const [name, v] of Object.entries(p)) {
    keys(v, 'type,value');
    if (
      !name ||
      name.length > 128 ||
      !['text', 'date', 'checkbox', 'number'].includes(v.type)
    )
      throw Error('INVALID_PROPERTY');
    if (v.value === null) continue;
    const valid =
      v.type === 'text'
        ? typeof v.value === 'string' && v.value.length <= 10000
        : v.type === 'checkbox'
          ? typeof v.value === 'boolean'
          : v.type === 'number'
            ? typeof v.value === 'number' && Number.isFinite(v.value)
            : typeof v.value === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(v.value) &&
              Number.isFinite(Date.parse(v.value)) &&
              new Date(v.value).toISOString().slice(0, 10) === v.value;
    if (!valid) throw Error('INVALID_PROPERTY_VALUE');
  }
}
// Strict JSON validation precedes PM parsing: nodeFromJSON otherwise discards unknown fields.
export function validateDocument(value, schema = noteSchema) {
  keys(value, 'type,content');
  if (
    value.type !== 'doc' ||
    !Array.isArray(value.content) ||
    value.content.length < 2
  )
    throw Error('INVALID_DOCUMENT');
  const seen = new Map();
  for (const [index, b] of value.content.entries()) {
    const allowed =
      index === 0
        ? ['title']
        : ['paragraph', 'heading', 'separator', 'list_item'];
    keys(b, b.content === undefined ? 'type,attrs' : 'type,attrs,content');
    if (!allowed.includes(b.type)) throw Error('UNSUPPORTED_CONTENT');
    if (b.type === 'separator' && b.content !== undefined)
      throw Error('INVALID_SEPARATOR');
    const baseAttrs =
      index === 0
        ? 'blockId'
        : b.type === 'heading'
          ? 'blockId,indent,parentId,level'
          : b.type === 'list_item'
            ? 'blockId,indent,parentId,listStyle'
            : 'blockId,indent,parentId';
    keys(
      b.attrs,
      baseAttrs +
        (Object.hasOwn(b.attrs ?? {}, 'background') ? ',background' : '')
    );
    if (
      Object.hasOwn(b.attrs, 'background') &&
      (!['paragraph', 'heading', 'list_item'].includes(b.type) ||
        (b.attrs.background !== null && !isPreset(b.attrs.background)))
    )
      throw Error('INVALID_BLOCK_BACKGROUND');
    if (
      b.type === 'heading' &&
      (!Number.isSafeInteger(b.attrs.level) ||
        b.attrs.level < 1 ||
        b.attrs.level > 6)
    )
      throw Error('INVALID_HEADING_LEVEL');
    if (
      b.type === 'list_item' &&
      !['ordered', 'unordered'].includes(b.attrs.listStyle)
    )
      throw Error('INVALID_LIST_STYLE');
    if (!id(b.attrs.blockId) || seen.has(b.attrs.blockId))
      throw Error('DUPLICATE_OR_INVALID_BLOCK_ID');
    if (index > 0) {
      const { indent, parentId } = b.attrs;
      if (!Number.isSafeInteger(indent) || indent < 0 || indent > 64)
        throw Error('INVALID_INDENT');
      if (
        parentId !== null &&
        (!id(parentId) || !seen.has(parentId) || seen.get(parentId) >= indent)
      )
        throw Error('INVALID_PARENT');
    }
    seen.set(b.attrs.blockId, index === 0 ? Infinity : b.attrs.indent);
    if (b.content !== undefined && !Array.isArray(b.content))
      throw Error('INVALID_INLINE');
    for (const n of b.content ?? []) {
      if (n.type === 'text') {
        keys(n, n.marks === undefined ? 'type,text' : 'type,text,marks');
        if (typeof n.text !== 'string' || !n.text || /[\r\n]/.test(n.text))
          throw Error('INVALID_TEXT');
        if (n.marks !== undefined && !Array.isArray(n.marks))
          throw Error('INVALID_MARKS');
        const markTypes = new Set();
        for (const m of n.marks ?? []) {
          keys(m, m.attrs === undefined ? 'type' : 'type,attrs');
          if (markTypes.has(m.type)) throw Error('DUPLICATE_MARK');
          markTypes.add(m.type);
          validateFormat(
            m.type,
            m.attrs === undefined ? {} : m.attrs,
            index === 0
          );
        }
      } else if (n.type === 'hard_break' && index > 0) {
        keys(n, 'type');
      } else if (n.type === 'note_reference') {
        keys(n, 'type,attrs');
        keys(n.attrs, 'pageId,label');
        if (
          !id(n.attrs.pageId) ||
          typeof n.attrs.label !== 'string' ||
          n.attrs.label.length > 10000 ||
          /[\r\n]/.test(n.attrs.label)
        )
          throw Error('INVALID_REFERENCE');
      } else if (n.type === 'date') {
        keys(n, 'type,attrs');
        keys(n.attrs, 'value');
        const v = n.attrs.value;
        if (
          typeof v !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          !Number.isFinite(Date.parse(v)) ||
          new Date(v).toISOString().slice(0, 10) !== v
        )
          throw Error('INVALID_DATE');
      } else throw Error('UNSUPPORTED_CONTENT');
    }
  }
  const doc = parse(schema, value);
  if (doc.nodeSize > 200000 || plainTitle(value).length > 10000)
    throw Error('CONTENT_LIMIT');
  return doc;
}
export function validatePage(kind, n) {
  keys(n, 'content,properties');
  validateDocument(n.content, kind === 'notes' ? noteSchema : taskSchema);
  properties(n.properties);
}
export function setContent(record, schema, content, d) {
  const fragment = record.get('content'),
    { mapping } = initProseMirrorDoc(fragment, schema);
  updateYFragment(d, fragment, validateDocument(content, schema), {
    mapping,
    isOMark: new Map(),
  });
}
export function setProperties(record, values) {
  const p = record.get('properties');
  for (const k of [...p.keys()]) if (!Object.hasOwn(values, k)) p.delete(k);
  for (const [k, v] of Object.entries(values)) p.set(k, structuredClone(v));
}

export const validateProperties = properties;
