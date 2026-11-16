import {
  validateAssociations,
  admitImport,
  id,
  exact,
  pageExists,
} from '../../../../../packages/foundation-runtime/src/media-policy.mjs';
export { validateAssociations, admitImport };
// External immutable files extend the canonical entity root, not its reducers.
import * as Y from 'yjs';
import * as entity from '../entities/model.mjs';
import { stable } from '../durable/model.mjs';
import { publish, readObject } from './files.mjs';
import { MAX_BYTES } from './formats.mjs';
export const marker = 'CLUTTER-R08-EXTERNAL-MEDIA-Y-EXPERIMENT-1\n';
export const schemaVersion = 4,
  storageType = 'BLOB',
  codec = 'clutter-r08-media-y-v1';
const prefix = Buffer.from(codec + '\0schema1\0yjs13.6.33\0'),
  roots = ['assets', 'assetLinks'];
const baseState = (s) => ({
  payload: s.payload,
  notes: s.notes,
  tasks: s.tasks,
  attachments: [],
});
export function stateOf(d) {
  const s = {
    ...entity.stateOf(d, roots),
    assets: Object.fromEntries(d.getMap('assets').entries()),
    assetLinks: Object.fromEntries(d.getMap('assetLinks').entries()),
  };
  return validateAssociations(s);
}
export function initial() {
  const s = entity.initial(),
    d = entity.ydoc(s.payload);
  try {
    for (const root of roots) d.getMap(root);
    return stateOf(d);
  } finally {
    d.destroy();
  }
}
export function validateState(s) {
  exact(s, [
    'payload',
    'notes',
    'tasks',
    'attachments',
    'assets',
    'assetLinks',
  ]);
  entity.validateState(baseState(s), roots);
  const d = entity.ydoc(s.payload);
  try {
    const derived = stateOf(d);
    if (
      stable(derived.assets) !== stable(s.assets) ||
      stable(derived.assetLinks) !== stable(s.assetLinks)
    )
      throw Error('MEDIA_PROJECTION_MISMATCH');
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
  if (b.length > 1500000 || !b.subarray(0, prefix.length).equals(prefix))
    throw Error('UNSUPPORTED_MEDIA_CODEC');
  const d = entity.ydoc(b.subarray(prefix.length).toString('base64'));
  try {
    return stateOf(d);
  } finally {
    d.destroy();
  }
}
const fields = {
  import_asset: ['pageId', 'attachmentId', 'name', 'role', 'mime', 'base64'],
  remove_asset: ['attachmentId'],
  read_asset: ['attachmentId', 'version'],
};
export const reduceMethods = [
  ...entity.reduceMethods,
  'import_asset',
  'remove_asset',
];
export const mutations = [...reduceMethods, 'pin_version'],
  readMethods = ['read_asset'];
export function validateCommand(c) {
  if (!Object.hasOwn(fields, c?.method)) return entity.validateCommand(c);
  const read = c.method === 'read_asset',
    keys = [
      'method',
      'spaceId',
      'documentId',
      ...(read ? [] : ['operationId', 'expectedVersion']),
      ...fields[c.method],
    ];
  exact(c, keys);
  for (const k of [
    'spaceId',
    'documentId',
    'operationId',
    'pageId',
    'attachmentId',
  ])
    if (c[k] !== undefined && !id(c[k])) throw Error('INVALID_ID');
  for (const k of ['version', 'expectedVersion'])
    if (c[k] !== undefined && (!Number.isSafeInteger(c[k]) || c[k] < 0))
      throw Error('INVALID_VERSION');
  if (c.method === 'import_asset') {
    if (
      typeof c.name !== 'string' ||
      !c.name ||
      c.name.length > 256 ||
      !['body', 'cover'].includes(c.role) ||
      !['image/png', 'application/pdf'].includes(c.mime)
    )
      throw Error('INVALID_ASSET_INPUT');
    if (c.role === 'cover' && c.mime !== 'image/png')
      throw Error('INVALID_COVER');
    if (
      typeof c.base64 !== 'string' ||
      c.base64.length > Math.ceil(MAX_BYTES / 3) * 4 ||
      !c.base64.length ||
      Buffer.from(c.base64, 'base64').toString('base64') !== c.base64
    )
      throw Error('INVALID_ASSET_BASE64');
  }
}
export const commandSchema = {
  type: 'object',
  oneOf: [
    ...entity.commandSchema.oneOf,
    ...Object.entries(fields).map(([method, list]) => {
      const keys = [
        'method',
        'spaceId',
        'documentId',
        ...(method === 'read_asset' ? [] : ['operationId', 'expectedVersion']),
        ...list,
      ];
      return {
        type: 'object',
        additionalProperties: false,
        required: keys,
        properties: Object.fromEntries(
          keys.map((k) => [
            k,
            k === 'method'
              ? { const: method }
              : ['version', 'expectedVersion'].includes(k)
                ? { type: 'integer', minimum: 0 }
                : { type: 'string' },
          ])
        ),
      };
    }),
  ],
};
export async function reduce(s, c, store) {
  if (entity.reduceMethods.includes(c.method)) {
    const next = entity.reduce(baseState(s), c, store, roots),
      d = entity.ydoc(next.payload);
    try {
      return stateOf(d);
    } finally {
      d.destroy();
    }
  }
  const d = entity.ydoc(s.payload);
  try {
    const assets = d.getMap('assets'),
      links = d.getMap('assetLinks');
    if (c.method === 'import_asset') {
      admitImport(c, {
        hasPage: (pageId) => pageExists(s, pageId),
        hasAttachment: (id) => links.has(id),
        pageLinks: Object.values(s.assetLinks).filter(
          (l) => l.pageId === c.pageId
        ),
      });
      const { digest, meta } = await publish(
        store,
        c,
        Buffer.from(c.base64, 'base64')
      );
      assets.set(digest, meta);
      links.set(c.attachmentId, {
        pageId: c.pageId,
        hash: digest,
        name: c.name,
        role: c.role,
      });
    } else {
      if (!links.has(c.attachmentId)) throw Error('ATTACHMENT_NOT_FOUND');
      const digest = links.get(c.attachmentId).hash;
      links.delete(c.attachmentId);
      if (![...links.values()].some((l) => l.hash === digest))
        assets.delete(digest);
    }
    const next = stateOf(d);
    validateState(next);
    return next;
  } finally {
    d.destroy();
  }
}
export function checkExternalState(s, store) {
  for (const [digest, meta] of Object.entries(s.assets))
    readObject(store, digest, meta);
}
export function read(c, store) {
  const s = store.root(c.version).state,
    link = s.assetLinks[c.attachmentId];
  if (!Object.hasOwn(s.assetLinks, c.attachmentId))
    throw Error('ATTACHMENT_NOT_FOUND');
  const bytes = readObject(store, link.hash, s.assets[link.hash]);
  return {
    version: c.version,
    ...link,
    ...s.assets[link.hash],
    base64: bytes.toString('base64'),
  };
}
