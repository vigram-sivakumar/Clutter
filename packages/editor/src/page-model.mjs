// Page validation/mutation mechanics shared by the current codec and historical fixtures.
import { initProseMirrorDoc, updateYFragment } from 'y-prosemirror';
import { noteSchema, taskSchema, slotId, parse } from './schema.mjs';
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
export function validatePage(
  kind,
  n,
  { seenBlocks = new Set(), hasTask = () => true } = {}
) {
  keys(n, kind === 'notes' ? 'title,body' : 'title,body,properties');
  if (typeof n.title !== 'string' || n.title.length > 10000)
    throw Error('INVALID_TITLE');
  const doc = parse(kind === 'notes' ? noteSchema : taskSchema, n.body);
  if (doc.nodeSize > 200000) throw Error('BODY_LIMIT');
  const slots = [];
  doc.descendants((b) => {
    if (b.isText) return;
    if (!id(b.attrs.blockId) || seenBlocks.has(b.attrs.blockId))
      throw Error('DUPLICATE_OR_INVALID_BLOCK_ID');
    seenBlocks.add(b.attrs.blockId);
    if (b.type.name === 'task_slot') {
      if (!hasTask(b.attrs.taskId)) throw Error('DANGLING_TASK');
      if (b.attrs.blockId !== slotId(b.attrs.taskId))
        throw Error('INVALID_SLOT_ID');
      slots.push({ taskId: b.attrs.taskId, blockId: b.attrs.blockId });
    }
  });
  if (kind === 'tasks') properties(n.properties);
  return { blockIds: [...seenBlocks], slots };
}
export function setBody(record, schema, body, d) {
  const fragment = record.get('body'),
    { mapping } = initProseMirrorDoc(fragment, schema);
  updateYFragment(d, fragment, parse(schema, body), {
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
