// Versioned experiment codec. Only Y bytes are persisted; PM JSON is derived.
import * as Y from 'yjs';
import {
  prosemirrorToYDoc,
  yDocToProsemirror,
  initProseMirrorDoc,
  absolutePositionToRelativePosition,
} from 'y-prosemirror';
import {
  fixture,
  schema,
  validateDocument,
  textPosition,
} from '../src/schema.mjs';
import { stable, validateCommand as validateOld } from '../durable/model.mjs';
export const marker = 'CLUTTER-R08-JOINED-Y-EXPERIMENT-1\n';
export const storageType = 'BLOB';
export const codec = 'clutter-r08-y-state-v1';
const prefix = Buffer.from(codec + '\0schema1\0yjs13.6.33\0');
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
function validateRoots(d) {
  if (Object.keys(d.toJSON()).sort().join() !== 'prosemirror')
    throw Error('UNSUPPORTED_Y_ROOT');
}
export function stateOf(d) {
  const doc = yDocToProsemirror(schema, d);
  validateRoots(d);
  return {
    payload: Buffer.from(Y.encodeStateAsUpdate(d)).toString('base64'),
    doc: doc.toJSON(),
    attachments: [],
  };
}
export function initial() {
  const d = prosemirrorToYDoc(fixture());
  try {
    return stateOf(d);
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
  if (!b.subarray(0, prefix.length).equals(prefix))
    throw Error('UNSUPPORTED_Y_CODEC');
  const d = ydoc(b.subarray(prefix.length).toString('base64'));
  try {
    return stateOf(d);
  } finally {
    d.destroy();
  }
}
export function validateState(s) {
  if (
    !s ||
    typeof s.payload !== 'string' ||
    s.payload.length > 700000 ||
    Buffer.from(s.payload, 'base64').toString('base64') !== s.payload ||
    s.attachments?.length !== 0
  )
    throw Error('INVALID_Y_STATE');
  const d = ydoc(s.payload);
  try {
    const pm = yDocToProsemirror(schema, d);
    validateRoots(d);
    validateDocument(pm);
    if (stable(pm.toJSON()) !== stable(s.doc))
      throw Error('Y_PROJECTION_MISMATCH');
  } finally {
    d.destroy();
  }
}
const fields = {
  editor_update: ['contextId', 'baseVersion', 'payload'],
  protect: ['contextId', 'generation', 'baseVersion', 'state'],
  release_protection: ['contextId', 'ownerEpoch', 'throughGeneration'],
};
export function validateCommand(c) {
  if (!fields[c?.method]) {
    if (
      ![
        'read',
        'read_version',
        'outcome',
        'list_recovery',
        'insert',
        'pin_version',
        'restore_protection',
      ].includes(c?.method)
    )
      throw Error('UNSUPPORTED_JOINED_COMMAND');
    return validateOld(c);
  }
  const allowed = [
    'method',
    'spaceId',
    'documentId',
    'operationId',
    ...fields[c.method],
  ];
  if (
    Object.keys(c).some((k) => !allowed.includes(k)) ||
    allowed.some((k) => c[k] === undefined)
  )
    throw Error('INVALID_COMMAND');
  for (const k of ['spaceId', 'documentId', 'operationId', 'contextId'])
    if (typeof c[k] !== 'string' || !c[k] || c[k].length > 160)
      throw Error('INVALID_ID');
  for (const k of ['baseVersion', 'generation', 'throughGeneration'])
    if (c[k] !== undefined && (!Number.isSafeInteger(c[k]) || c[k] < 0))
      throw Error('INVALID_VERSION');
  if (
    c.method === 'editor_update' &&
    (typeof c.payload !== 'string' ||
      c.payload.length > 700000 ||
      Buffer.from(c.payload, 'base64').toString('base64') !== c.payload)
  )
    throw Error('UPDATE_LIMIT');
  if (c.method === 'protect') validateState(c.state);
}
export function authorize(c, grant) {
  if (fields[c.method] && grant?.contextId !== c.contextId)
    throw Error('CONTEXT_GRANT_REQUIRED');
}
export const mutations = [
  'editor_update',
  'insert',
  'protect',
  'release_protection',
  'pin_version',
  'restore_protection',
];
export const reduceMethods = ['editor_update', 'insert'];
export const deduplicateState = true;
export function validateProtection(s, base) {
  const a = ydoc(s.payload),
    b = ydoc(base.payload);
  try {
    if (
      stable(embedsAndTasks(yDocToProsemirror(schema, a))) !==
      stable(embedsAndTasks(yDocToProsemirror(schema, b)))
    )
      throw Error('IMMUTABLE_FIXTURE_ID_OR_EMBED');
  } finally {
    a.destroy();
    b.destroy();
  }
}
export const resultMeta = (c) => ({
  contextId: c.method === 'editor_update' ? c.contextId : 'external',
});
function embedsAndTasks(doc) {
  const embeds = [],
    ids = [];
  doc.descendants((n) => {
    if (n.type.name === 'embed') embeds.push(n.toJSON());
    if (n.type.name === 'task') ids.push(n.attrs.id);
  });
  return { embeds, ids: ids.sort() };
}
export function reduce(s, c, store) {
  const d = ydoc(s.payload);
  try {
    if (c.method === 'editor_update') {
      store.root(c.baseVersion);
      const before = embedsAndTasks(yDocToProsemirror(schema, d));
      // Full peer state carries dependencies; fail if bytes cannot round-trip as a valid fixture.
      const proposal = ydoc(c.payload);
      try {
        validateDocument(yDocToProsemirror(schema, proposal));
      } finally {
        proposal.destroy();
      }
      Y.applyUpdate(d, Buffer.from(c.payload, 'base64'));
      const after = embedsAndTasks(yDocToProsemirror(schema, d));
      if (stable(before) !== stable(after))
        throw Error('IMMUTABLE_FIXTURE_ID_OR_EMBED');
    } else {
      const fragment = d.getXmlFragment('prosemirror'),
        { doc, mapping } = initProseMirrorDoc(fragment, schema),
        pos = textPosition(doc, c.target, c.offset),
        rel = absolutePositionToRelativePosition(pos, fragment, mapping),
        abs = Y.createAbsolutePositionFromRelativePosition(rel, d);
      if (!(abs?.type instanceof Y.XmlText)) throw Error('NOT_TEXT_TARGET');
      d.transact(() => abs.type.insert(abs.index, c.text), 'external');
    }
    const result = stateOf(d);
    validateState(result);
    return result;
  } finally {
    d.destroy();
  }
}
export function readMeta(store) {
  return {
    codec,
    roots: store.db
      .prepare('SELECT version,operation_id FROM revisions ORDER BY version')
      .all()
      .map((r) => ({
        version: r.version,
        contextId: r.operation_id
          ? store.outcome(r.operation_id).contextId
          : 'genesis',
        doc: store.root(r.version).state.doc,
      })),
  };
}
export const commandSchema = {
  type: 'object',
  required: ['method', 'spaceId', 'documentId'],
  properties: {
    method: {
      enum: [
        'read',
        'read_version',
        'outcome',
        'list_recovery',
        'insert',
        'pin_version',
        'restore_protection',
      ],
    },
  },
  additionalProperties: true,
};
