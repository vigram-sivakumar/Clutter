import { PAGE_CODEC, pageRootPrefix } from '../../core/src/root-envelope.ts';
import { pageFields } from '../../core/src/page-fields.ts';
import * as Y from 'yjs';
import {
  prosemirrorToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from 'y-prosemirror';
import { noteSchema, taskSchema, parse } from './schema.mjs';
import {
  validatePage,
  validateProperties,
  setContent,
  setProperties,
} from './page-model.mjs';
import { createHash } from 'node:crypto';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const codec = PAGE_CODEC;
const prefix = (pageId, kind) => Buffer.from(pageRootPrefix(pageId, kind));
function validateXml(fragment) {
  fragment.toArray().forEach((block, index) => {
    if (
      !(block instanceof Y.XmlElement) ||
      !(
        index === 0
          ? ['title']
          : ['paragraph', 'heading', 'separator', 'list_item']
      ).includes(block.nodeName)
    )
      throw Error('UNSUPPORTED_CONTENT');
    const allowed =
      index === 0
        ? ['blockId']
        : block.nodeName === 'heading'
          ? ['blockId', 'indent', 'parentId', 'level']
          : block.nodeName === 'list_item'
            ? ['blockId', 'indent', 'parentId', 'listStyle']
            : ['blockId', 'indent', 'parentId'];
    if (block.nodeName === 'separator' && block.length)
      throw Error('INVALID_SEPARATOR');
    if (Object.keys(block.getAttributes()).some((k) => !allowed.includes(k)))
      throw Error('UNSUPPORTED_CONTENT');
    for (const child of block.toArray()) {
      if (child instanceof Y.XmlText) {
        for (const op of child.toDelta()) {
          if (
            typeof op.insert !== 'string' ||
            Object.keys(op.attributes ?? {}).some((k) => k !== 'link')
          )
            throw Error('UNSUPPORTED_CONTENT');
          if (
            op.attributes?.link &&
            (typeof op.attributes.link !== 'object' ||
              Object.keys(op.attributes.link).join() !== 'href')
          )
            throw Error('INVALID_LINK');
        }
      } else {
        const attrs =
          child instanceof Y.XmlElement ? child.getAttributes() : {};
        const fields = {
          note_reference: ['label', 'pageId'],
          date: ['value'],
          hard_break: [],
        }[child.nodeName];
        if (
          !fields ||
          child.length ||
          Object.keys(attrs).sort().join() !== fields.join()
        )
          throw Error('UNSUPPORTED_CONTENT');
      }
    }
  });
}
export function projection(d, kind) {
  if (!['notes', 'tasks'].includes(kind)) throw Error('UNSUPPORTED_PAGE_KIND');
  d.getMap('links');
  if ([...d.share.keys()].sort().join() !== 'links,page')
    throw Error('UNSUPPORTED_PAGE_ROOT');
  const record = d.getMap('page');
  if (
    [...record.keys()].sort().join() !== 'content,properties' ||
    !(record.get('content') instanceof Y.XmlFragment) ||
    !(record.get('properties') instanceof Y.Map)
  )
    throw Error('INVALID_PAGE_RECORD');
  validateXml(record.get('content'));
  const p = pageFields(d, (fragment) =>
    yXmlFragmentToProseMirrorRootNode(
      fragment,
      kind === 'notes' ? noteSchema : taskSchema
    ).toJSON()
  );
  validateProperties(p.properties);
  validatePage(kind, entityProjection(p, kind));
  return p;
}
export const entityProjection = (p, _kind) => ({
  content: p.content,
  properties: p.properties,
});
export function fresh(kind, p) {
  validatePage(kind, p);
  const d = new Y.Doc(),
    record = d.getMap('page'),
    body = new Y.XmlFragment();
  record.set('content', body);
  record.set('properties', new Y.Map());
  d.getMap('links');
  prosemirrorToYXmlFragment(
    parse(kind === 'notes' ? noteSchema : taskSchema, p.content),
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
  setContent(record, kind === 'notes' ? noteSchema : taskSchema, p.content, d);
  if (p.properties !== undefined) setProperties(record, p.properties);
}
