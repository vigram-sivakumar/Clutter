// Synthetic shared domain contract. Adapters have no document reducers.
import { createHash } from 'node:crypto';
import { Transform } from 'prosemirror-transform';
import {
  fixture,
  schema,
  validateDocument,
  textPosition,
} from '../src/schema.mjs';
export const stable = (v) =>
  JSON.stringify(
    v && typeof v === 'object'
      ? Array.isArray(v)
        ? v.map((x) => JSON.parse(stable(x)))
        : Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, JSON.parse(stable(v[k]))])
          )
      : v
  );
export const hash = (v) => createHash('sha256').update(v).digest('hex');
export const initial = () => ({ doc: fixture().toJSON(), attachments: [] });
export function validateState(s) {
  if (
    !s ||
    Object.keys(s).sort().join() !== 'attachments,doc' ||
    !Array.isArray(s.attachments)
  )
    throw Error('INVALID_STATE');
  validateDocument(schema.nodeFromJSON(s.doc));
  const ids = new Set();
  for (const a of s.attachments) {
    if (
      !a ||
      typeof a.id !== 'string' ||
      !a.id ||
      ids.has(a.id) ||
      !/^[a-f0-9]{64}$/.test(a.blobHash) ||
      typeof a.name !== 'string' ||
      typeof a.mime !== 'string'
    )
      throw Error('INVALID_ATTACHMENT');
    ids.add(a.id);
  }
}
export const mutations = [
  'insert',
  'task_update',
  'attach',
  'remove_attachment',
  'pin_version',
  'restore_version',
  'protect',
  'release_protection',
  'restore_protection',
];
const fields = {
  read: [],
  read_version: ['version'],
  outcome: ['operationId'],
  list_recovery: [],
  insert: ['operationId', 'expectedVersion', 'target', 'offset', 'text'],
  task_update: [
    'operationId',
    'expectedVersion',
    'taskId',
    'completed',
    'properties',
  ],
  attach: [
    'operationId',
    'expectedVersion',
    'attachmentId',
    'name',
    'mime',
    'base64',
  ],
  remove_attachment: ['operationId', 'expectedVersion', 'attachmentId'],
  pin_version: ['operationId', 'version'],
  restore_version: ['operationId', 'expectedVersion', 'version'],
  protect: ['operationId', 'contextId', 'generation', 'baseVersion', 'state'],
  release_protection: [
    'operationId',
    'contextId',
    'throughGeneration',
    'ownerEpoch',
  ],
  restore_protection: [
    'operationId',
    'expectedVersion',
    'contextId',
    'generation',
  ],
};
const numbers = [
  'version',
  'expectedVersion',
  'offset',
  'baseVersion',
  'generation',
  'throughGeneration',
];
export const commandSchema = {
  type: 'object',
  oneOf: Object.entries(fields).map(([method, keys]) => ({
    type: 'object',
    required: ['method', 'spaceId', 'documentId', ...keys],
    additionalProperties: false,
    properties: Object.fromEntries(
      ['method', 'spaceId', 'documentId', ...keys].map((k) => [
        k,
        k === 'method'
          ? { const: method }
          : numbers.includes(k)
            ? { type: 'integer', minimum: 0 }
            : k === 'completed'
              ? { type: 'boolean' }
              : ['state', 'properties'].includes(k)
                ? { type: 'object' }
                : { type: 'string' },
      ])
    ),
  })),
};
export function validateCommand(c) {
  if (
    !c ||
    !Object.hasOwn(fields, c.method) ||
    Object.keys(c).some(
      (k) =>
        !['method', 'spaceId', 'documentId', ...fields[c.method]].includes(k)
    )
  )
    throw Error('INVALID_COMMAND');
  for (const k of ['spaceId', 'documentId', ...fields[c.method]])
    if (c[k] === undefined) throw Error('MISSING_' + k);
  for (const k of [
    'operationId',
    'spaceId',
    'documentId',
    'contextId',
    'attachmentId',
    'taskId',
    'ownerEpoch',
  ])
    if (
      c[k] !== undefined &&
      (typeof c[k] !== 'string' || !c[k] || c[k].length > 160)
    )
      throw Error('INVALID_' + k);
  for (const k of [
    'version',
    'expectedVersion',
    'offset',
    'baseVersion',
    'generation',
    'throughGeneration',
  ])
    if (c[k] !== undefined && (!Number.isSafeInteger(c[k]) || c[k] < 0))
      throw Error('INVALID_' + k);
  if (
    c.method === 'insert' &&
    (typeof c.target !== 'string' ||
      !c.target ||
      typeof c.text !== 'string' ||
      !c.text ||
      c.text.length > 100000)
  )
    throw Error('INVALID_INSERT');
  if (
    c.method === 'task_update' &&
    (typeof c.completed !== 'boolean' ||
      !c.properties ||
      typeof c.properties !== 'object' ||
      Array.isArray(c.properties))
  )
    throw Error('INVALID_TASK');
  if (c.method === 'protect') validateState(c.state);
}
export function reduce(state, c) {
  const s = structuredClone(state);
  if (c.method === 'insert') {
    const d = schema.nodeFromJSON(s.doc);
    if (c.offset > c.target.length) throw Error('INVALID_OFFSET');
    s.doc = new Transform(d)
      .insert(textPosition(d, c.target, c.offset), schema.text(c.text))
      .doc.toJSON();
  } else if (c.method === 'task_update') {
    let found = false;
    const walk = (n) => {
      if (n.type === 'task' && n.attrs.id === c.taskId) {
        n.attrs.completed = c.completed;
        n.attrs.properties = c.properties;
        found = true;
      }
      n.content?.forEach(walk);
    };
    walk(s.doc);
    if (!found) throw Error('TASK_NOT_FOUND');
  } else if (c.method === 'remove_attachment') {
    if (!s.attachments.some((a) => a.id === c.attachmentId))
      throw Error('ATTACHMENT_NOT_FOUND');
    s.attachments = s.attachments.filter((a) => a.id !== c.attachmentId);
  }
  validateState(s);
  return s;
}
