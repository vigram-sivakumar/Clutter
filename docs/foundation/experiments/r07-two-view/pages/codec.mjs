import * as Y from 'yjs';
import {
  prosemirrorToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from 'y-prosemirror';
import { noteSchema, taskSchema, parse } from '../entities/schema.mjs';
import {
  validatePage,
  validateProperties,
  setBody,
  setProperties,
} from '../entities/model.mjs';
import { hash } from '../media/formats.mjs';
export const codec = 'clutter-page-y-v1';
const prefix = (pageId, kind) =>
  Buffer.from(codec + '\0schema1\0yjs13.6.33\0' + pageId + '\0' + kind + '\0');
export function projection(d, kind) {
  if (!['notes', 'tasks'].includes(kind)) throw Error('UNSUPPORTED_PAGE_KIND');
  d.getMap('links');
  if ([...d.share.keys()].sort().join() !== 'links,page')
    throw Error('UNSUPPORTED_PAGE_ROOT');
  const record = d.getMap('page');
  if (
    [...record.keys()].sort().join() !== 'body,properties,title' ||
    !(record.get('body') instanceof Y.XmlFragment) ||
    !(record.get('properties') instanceof Y.Map)
  )
    throw Error('INVALID_PAGE_RECORD');
  const p = {
    title: record.get('title'),
    body: yXmlFragmentToProseMirrorRootNode(
      record.get('body'),
      kind === 'notes' ? noteSchema : taskSchema
    ).toJSON(),
    properties: Object.fromEntries(record.get('properties').entries()),
    links: Object.fromEntries(d.getMap('links').entries()),
  };
  validateProperties(p.properties);
  validatePage(kind, entityProjection(p, kind));
  return p;
}
export const entityProjection = (p, kind) =>
  kind === 'notes'
    ? { title: p.title, body: p.body }
    : { title: p.title, body: p.body, properties: p.properties };
export function fresh(kind, p) {
  const d = new Y.Doc(),
    record = d.getMap('page'),
    body = new Y.XmlFragment();
  record.set('title', p.title);
  record.set('body', body);
  record.set('properties', new Y.Map());
  d.getMap('links');
  prosemirrorToYXmlFragment(
    parse(kind === 'notes' ? noteSchema : taskSchema, p.body),
    body
  );
  setProperties(record, p.properties ?? {});
  return d;
}
export function encode(d, pageId, kind, metrics) {
  projection(d, kind);
  const bytes = Buffer.concat([
    prefix(pageId, kind),
    Buffer.from(Y.encodeStateAsUpdate(d)),
  ]);
  metrics?.encoded.push({ pageId, bytes: bytes.length });
  return { pageId, kind, hash: hash(bytes), bytes };
}
export function decode(row, metrics) {
  const bytes = Buffer.from(row.payload ?? row.bytes),
    p = prefix(row.page_id ?? row.pageId, row.kind);
  if (hash(bytes) !== (row.root_hash ?? row.hash))
    throw Error('BROKEN_PAGE_HASH');
  if (bytes.length > 1500000 || !bytes.subarray(0, p.length).equals(p))
    throw Error('UNSUPPORTED_PAGE_CODEC');
  metrics?.decoded.push({
    pageId: row.page_id ?? row.pageId,
    bytes: bytes.length,
  });
  const d = new Y.Doc();
  try {
    Y.applyUpdate(d, bytes.subarray(p.length));
    projection(d, row.kind);
    return d;
  } catch (e) {
    d.destroy();
    throw e;
  }
}
export function apply(d, kind, p) {
  const record = d.getMap('page');
  record.set('title', p.title);
  setBody(record, kind === 'notes' ? noteSchema : taskSchema, p.body, d);
  if (p.properties !== undefined) setProperties(record, p.properties);
}
