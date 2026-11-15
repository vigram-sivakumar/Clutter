// Proposed multi-entity Y root. Only Y bytes persist; maps below are projections.
import * as Y from 'yjs';
import {
  prosemirrorToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
  initProseMirrorDoc,
  updateYFragment,
} from 'y-prosemirror';
import { stable, validateCommand as legacy } from '../durable/model.mjs';
import {
  noteSchema,
  taskSchema,
  paragraph,
  document,
  slot,
  slotId,
  parse,
} from './schema.mjs';
export const marker = 'CLUTTER-R08-ENTITY-Y-EXPERIMENT-1\n';
export const schemaVersion = 3;
export const storageType = 'BLOB';
export const codec = 'clutter-r08-entity-y-v1';
const prefix = Buffer.from(codec + '\0schema1\0yjs13.6.33\0');
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
export function placements(s) {
  const result = {};
  for (const [noteId, n] of Object.entries(s.notes))
    for (const b of n.body.content ?? []) {
      if (b.type !== 'task_slot') continue;
      const taskId = b.attrs.taskId;
      if (!Object.hasOwn(s.tasks, taskId)) throw Error('DANGLING_TASK');
      if (Object.hasOwn(result, taskId))
        throw Error('DUPLICATE_TASK_PLACEMENT');
      if (b.attrs.blockId !== slotId(taskId)) throw Error('INVALID_SLOT_ID');
      Object.defineProperty(result, taskId, {
        value: { noteId, blockId: b.attrs.blockId },
        enumerable: true,
      });
    }
  return result;
}
function validateProjection(s) {
  const ids = new Set();
  let count = 0;
  for (const [kind, schema] of [
    ['notes', noteSchema],
    ['tasks', taskSchema],
  ]) {
    for (const [entityId, n] of Object.entries(s[kind])) {
      if (!id(entityId) || entityId === 'inbox' || ++count > 200)
        throw Error('INVALID_ENTITY_ID');
      if (Object.hasOwn(s[kind === 'notes' ? 'tasks' : 'notes'], entityId))
        throw Error('DUPLICATE_ENTITY_ID');
      keys(n, kind === 'notes' ? 'title,body' : 'title,body,properties');
      if (typeof n.title !== 'string' || n.title.length > 10000)
        throw Error('INVALID_TITLE');
      const doc = parse(schema, n.body);
      if (doc.nodeSize > 200000) throw Error('BODY_LIMIT');
      doc.descendants((b) => {
        if (b.isText) return;
        if (!id(b.attrs.blockId) || ids.has(b.attrs.blockId))
          throw Error('DUPLICATE_OR_INVALID_BLOCK_ID');
        ids.add(b.attrs.blockId);
      });
      if (kind === 'tasks') properties(n.properties);
    }
  }
  placements(s);
}
export function ydoc(payload) {
  const d = new Y.Doc();
  try {
    Y.applyUpdate(d, Buffer.from(payload, 'base64'));
    return d;
  } catch (e) {
    d.destroy();
    throw e;
  }
}
export function stateOf(d) {
  if ([...d.share.keys()].sort().join() !== 'notes,tasks')
    throw Error('INVALID_ENTITY_ROOT');
  const out = { notes: {}, tasks: {} };
  for (const [kind, schema] of [
    ['notes', noteSchema],
    ['tasks', taskSchema],
  ]) {
    const map = d.getMap(kind);
    for (const [entityId, record] of map) {
      if (
        !(record instanceof Y.Map) ||
        [...record.keys()].sort().join() !==
          (kind === 'notes' ? 'body,title' : 'body,properties,title') ||
        !(record.get('body') instanceof Y.XmlFragment)
      )
        throw Error('INVALID_ENTITY_RECORD');
      const n = {
        title: record.get('title'),
        body: yXmlFragmentToProseMirrorRootNode(
          record.get('body'),
          schema
        ).toJSON(),
      };
      if (kind === 'tasks') {
        if (!(record.get('properties') instanceof Y.Map))
          throw Error('INVALID_PROPERTIES');
        n.properties = Object.fromEntries(record.get('properties').entries());
      }
      Object.defineProperty(out[kind], entityId, {
        value: n,
        enumerable: true,
      });
    }
  }
  validateProjection(out);
  return {
    payload: Buffer.from(Y.encodeStateAsUpdate(d)).toString('base64'),
    ...out,
    attachments: [],
  };
}
export function initial() {
  const d = new Y.Doc();
  try {
    for (const [kind, entityId, title, body, props] of [
      [
        'notes',
        'n1',
        'Planning',
        document(paragraph('n1-p1', 'Planning draft'), slot('t1')),
      ],
      [
        'notes',
        'n2',
        'Delivery',
        document(paragraph('n2-p1', 'Delivery draft')),
      ],
      [
        'tasks',
        't1',
        'Send proposal',
        document(paragraph('t1-p1', 'Budget details')),
        {
          DueDate: { type: 'date', value: '2026-11-20' },
          Priority: { type: 'text', value: 'High' },
        },
      ],
    ]) {
      const n = new Y.Map();
      d.getMap(kind).set(entityId, n);
      n.set('title', title);
      const bodyY = new Y.XmlFragment();
      n.set('body', bodyY);
      prosemirrorToYXmlFragment(
        parse(kind === 'notes' ? noteSchema : taskSchema, body),
        bodyY
      );
      if (props) {
        const p = new Y.Map();
        n.set('properties', p);
        for (const [k, v] of Object.entries(props)) p.set(k, v);
      }
    }
    return stateOf(d);
  } finally {
    d.destroy();
  }
}
export function validateState(s) {
  keys(s, 'payload,notes,tasks,attachments');
  if (
    typeof s.payload !== 'string' ||
    s.payload.length > 2000000 ||
    Buffer.from(s.payload, 'base64').toString('base64') !== s.payload ||
    !Array.isArray(s.attachments) ||
    s.attachments.length
  )
    throw Error('INVALID_ENTITY_STATE');
  const d = ydoc(s.payload);
  try {
    const derived = stateOf(d);
    if (
      stable(derived.notes) !== stable(s.notes) ||
      stable(derived.tasks) !== stable(s.tasks)
    )
      throw Error('ENTITY_PROJECTION_MISMATCH');
  } finally {
    d.destroy();
  }
}
export function encode(s) {
  validateState(s);
  return Buffer.concat([prefix, Buffer.from(s.payload, 'base64')]);
}
export function decode(bytes) {
  const b = Buffer.from(bytes);
  if (!b.subarray(0, prefix.length).equals(prefix) || b.length > 1500000)
    throw Error('UNSUPPORTED_ENTITY_CODEC');
  const d = ydoc(b.subarray(prefix.length).toString('base64'));
  try {
    return stateOf(d);
  } finally {
    d.destroy();
  }
}
const fields = {
  move_task: ['taskId', 'fromNoteId', 'toNoteId', 'index'],
  edit_task: ['taskId', 'title', 'body', 'properties'],
  edit_note: ['noteId', 'body'],
  restore_note: ['noteId', 'version'],
};
export const reduceMethods = Object.keys(fields);
export const mutations = [...reduceMethods, 'pin_version'];
export function validateCommand(c) {
  if (!Object.hasOwn(fields, c?.method)) {
    if (!['read', 'read_version', 'outcome', 'pin_version'].includes(c?.method))
      throw Error('UNSUPPORTED_ENTITY_COMMAND');
    return legacy(c);
  }
  keys(
    c,
    [
      'method',
      'spaceId',
      'documentId',
      'operationId',
      'expectedVersion',
      ...fields[c.method],
    ].join(',')
  );
  for (const k of [
    'spaceId',
    'documentId',
    'operationId',
    ...fields[c.method].filter((k) => k.endsWith('Id')),
  ])
    if (!id(c[k])) throw Error('INVALID_ID');
  for (const k of ['expectedVersion', 'version', 'index'])
    if (c[k] !== undefined && (!Number.isSafeInteger(c[k]) || c[k] < 0))
      throw Error('INVALID_VERSION_OR_INDEX');
  if (c.method === 'edit_task') {
    if (typeof c.title !== 'string' || c.title.length > 10000)
      throw Error('INVALID_TITLE');
    properties(c.properties);
    parse(taskSchema, c.body);
  }
  if (c.method === 'edit_note') parse(noteSchema, c.body);
}
export const commandSchema = {
  type: 'object',
  oneOf: [
    ...Object.entries(fields).map(([method, keys]) => ({
      type: 'object',
      additionalProperties: false,
      required: [
        'method',
        'spaceId',
        'documentId',
        'operationId',
        'expectedVersion',
        ...keys,
      ],
      properties: Object.fromEntries(
        [
          'method',
          'spaceId',
          'documentId',
          'operationId',
          'expectedVersion',
          ...keys,
        ].map((k) => [
          k,
          k === 'method'
            ? { const: method }
            : ['expectedVersion', 'version', 'index'].includes(k)
              ? { type: 'integer', minimum: 0 }
              : ['body', 'properties'].includes(k)
                ? { type: 'object' }
                : { type: 'string' },
        ])
      ),
    })),
    ...['read', 'read_version', 'outcome', 'pin_version'].map((method) => ({
      type: 'object',
      additionalProperties: false,
      required: [
        'method',
        'spaceId',
        'documentId',
        ...(method === 'read'
          ? []
          : method === 'outcome'
            ? ['operationId']
            : method === 'pin_version'
              ? ['operationId', 'version']
              : ['version']),
      ],
      properties: {
        method: { const: method },
        spaceId: { type: 'string' },
        documentId: { type: 'string' },
        ...(method === 'outcome' || method === 'pin_version'
          ? { operationId: { type: 'string' } }
          : {}),
        ...(method === 'read_version' || method === 'pin_version'
          ? { version: { type: 'integer', minimum: 0 } }
          : {}),
      },
    })),
  ],
};
const footprint = (body) =>
  stable(
    (body.content ?? [])
      .filter((b) => b.type === 'task_slot')
      .map((b) => b.attrs)
      .sort((a, b) => a.taskId.localeCompare(b.taskId))
  );
function setBody(record, schema, body, d) {
  const fragment = record.get('body'),
    { mapping } = initProseMirrorDoc(fragment, schema);
  updateYFragment(d, fragment, parse(schema, body), {
    mapping,
    isOMark: new Map(),
  });
}
export function reduce(s, c, store) {
  const d = ydoc(s.payload);
  try {
    const notes = d.getMap('notes'),
      tasks = d.getMap('tasks');
    if (c.method === 'move_task') {
      if (!tasks.has(c.taskId)) throw Error('TASK_NOT_FOUND');
      const current = placements(s)[c.taskId]?.noteId ?? 'inbox';
      if (current !== c.fromNoteId) throw Error('TASK_PLACEMENT_CONFLICT');
      if (current === c.toNoteId) throw Error('SAME_PLACEMENT');
      if (c.toNoteId !== 'inbox' && !notes.has(c.toNoteId))
        throw Error('NOTE_NOT_FOUND');
      if (current !== 'inbox') {
        const body = structuredClone(s.notes[current].body);
        body.content = body.content.filter(
          (b) => b.type !== 'task_slot' || b.attrs.taskId !== c.taskId
        );
        setBody(notes.get(current), noteSchema, body, d);
      }
      if (c.toNoteId !== 'inbox') {
        const body = structuredClone(s.notes[c.toNoteId].body);
        body.content ??= [];
        if (c.index > body.content.length) throw Error('INVALID_INDEX');
        body.content.splice(c.index, 0, slot(c.taskId));
        setBody(notes.get(c.toNoteId), noteSchema, body, d);
      } else if (c.index !== 0) throw Error('INVALID_INDEX');
    } else if (c.method === 'edit_task') {
      const task = tasks.get(c.taskId);
      if (!task) throw Error('TASK_NOT_FOUND');
      task.set('title', c.title);
      setBody(task, taskSchema, c.body, d);
      const p = task.get('properties');
      for (const k of [...p.keys()])
        if (!Object.hasOwn(c.properties, k)) p.delete(k);
      for (const [k, v] of Object.entries(c.properties))
        p.set(k, structuredClone(v));
    } else {
      const note = notes.get(c.noteId);
      if (!note) throw Error('NOTE_NOT_FOUND');
      let body = c.body;
      if (c.method === 'restore_note') {
        const old = store.root(c.version).state.notes[c.noteId];
        if (!old) throw Error('HISTORICAL_NOTE_NOT_FOUND');
        body = old.body;
      }
      if (footprint(s.notes[c.noteId].body) !== footprint(body))
        throw Error('TASK_PLACEMENT_CONFLICT');
      setBody(note, noteSchema, body, d);
    }
    const next = stateOf(d);
    validateState(next);
    return next;
  } finally {
    d.destroy();
  }
}
export function projectNote(s, noteId) {
  const note = s.notes[noteId];
  if (!note) throw Error('NOTE_NOT_FOUND');
  return {
    ...note,
    blocks: (note.body.content ?? []).map((b) =>
      b.type === 'task_slot'
        ? { ...b, task: structuredClone(s.tasks[b.attrs.taskId]) }
        : structuredClone(b)
    ),
  };
}
