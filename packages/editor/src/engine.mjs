import { assertBodyRebase } from '../../core/src/editor-rebase.ts';
export { assertBodyRebase };
import { createDecoder, hasContent } from 'lib0/decoding';
import * as Y from 'yjs';
// Current bounded content engine. Shipping feature/schema expansion remains separately gated.
import { fresh, encode, decode, projection, apply } from './page-codec.mjs';
import { Fault, stable, parseAssetLinks } from '../../core/src/contracts.ts';
const kind = (k) => (k === 'note' ? 'notes' : 'tasks');
function content(c) {
  if (
    c.content?.format !== 'clutter.page-json' ||
    c.content.schemaVersion !== 2
  )
    throw new Fault('UNSUPPORTED_CONTENT');
  return { content: c.content.value, properties: c.properties };
}
const root = (d, id, k) => {
  const r = encode(d, id, kind(k));
  return { pageId: id, kind: k, head: r.hash, bytes: r.bytes };
};
const read = (r) => decode({ ...r, kind: kind(r.kind), hash: r.head });
function staged(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Fault) throw e;
    if (e.message === 'UNSUPPORTED_PAGE_CODEC')
      throw new Fault('UNSUPPORTED_PAGE_CODEC');
    throw new Fault('INVALID_CONTENT');
  }
}
// Shared rebase admission: never hide a locally edited block or delete foreign work.
function mergeUpdate(previous, update) {
  const d = read(previous);
  try {
    const before = projection(d, kind(previous.kind));
    const decoder = createDecoder(update);
    Y.readUpdate(decoder, d);
    if (hasContent(decoder)) throw new Fault('INVALID_UPDATE_ENCODING');
    if (d.store.pendingStructs || d.store.pendingDs)
      throw new Fault('INCOMPLETE_UPDATE');
    const after = projection(d, kind(previous.kind));
    if (
      stable({
        properties: after.properties,
        links: after.links,
      }) !==
      stable({
        properties: before.properties,
        links: before.links,
      })
    )
      throw new Fault('EDITOR_SCOPE_VIOLATION');
    content({
      properties: after.properties,
      content: {
        format: 'clutter.page-json',
        schemaVersion: 2,
        value: after.content,
      },
    });
    return root(d, previous.pageId, previous.kind);
  } finally {
    d.destroy();
  }
}
export const qualifiedEngine = {
  assetLinks(previous) {
    return staged(() => {
      const d = read(previous);
      try {
        return parseAssetLinks(projection(d, kind(previous.kind)).links);
      } finally {
        d.destroy();
      }
    });
  },
  withAssetLinks(previous, links) {
    return staged(() => {
      const d = read(previous);
      try {
        const map = d.getMap('links'),
          valid = parseAssetLinks(links);
        for (const id of [...map.keys()])
          if (!Object.hasOwn(valid, id)) map.delete(id);
        for (const [id, link] of Object.entries(valid))
          map.set(id, { ...link });
        return root(d, previous.pageId, previous.kind);
      } finally {
        d.destroy();
      }
    });
  },
  applyUpdate(latest, base, update) {
    return staged(() => {
      const draft = mergeUpdate(base, update);
      assertBodyRebase(
        qualifiedEngine.project(base).content.value,
        qualifiedEngine.project(draft).content.value,
        qualifiedEngine.project(latest).content.value
      );
      return mergeUpdate(latest, update);
    });
  },
  create(id, k, c) {
    return staged(() => {
      const d = fresh(kind(k), content(c));
      try {
        return root(d, id, k);
      } finally {
        d.destroy();
      }
    });
  },
  update(previous, c) {
    return staged(() => {
      const d = read(previous);
      try {
        apply(d, kind(previous.kind), content(c));
        return root(d, previous.pageId, previous.kind);
      } finally {
        d.destroy();
      }
    });
  },
  project(r) {
    return staged(() => {
      const d = read(r);
      try {
        const p = projection(d, kind(r.kind));
        return {
          title: p.title,
          content: {
            format: 'clutter.page-json',
            schemaVersion: 2,
            value: p.content,
          },
          properties: p.properties,
        };
      } finally {
        d.destroy();
      }
    });
  },
};
