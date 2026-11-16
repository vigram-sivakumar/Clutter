import {
  createDecoder,
  hasContent,
} from '../experiments/r07-two-view/node_modules/lib0/decoding.js';
import * as Y from '../experiments/r07-two-view/node_modules/yjs/dist/yjs.mjs';
// Temporary I1a composition adapter; not a production codec or feature schema.
import {
  fresh,
  encode,
  decode,
  projection,
  apply,
} from '../experiments/r07-two-view/pages/codec.mjs';
import {
  Fault,
  stable,
  parseAssetLinks,
} from '../../../packages/foundation-runtime/src/contracts.ts';
const kind = (k) => (k === 'note' ? 'notes' : 'tasks');
function content(c) {
  if (c.body.format !== 'clutter.i1.pm-json' || c.body.schemaVersion !== 1)
    throw new Fault('UNSUPPORTED_CONTENT');
  const body = c.body.value;
  // Do not silently accept unimplemented owned-task placements or lose unknown keys.
  if (
    !body ||
    body.type !== 'doc' ||
    Object.keys(body).some((k) => !['type', 'content'].includes(k)) ||
    !Array.isArray(body.content) ||
    !body.content.length
  )
    throw new Fault('UNSUPPORTED_CONTENT');
  for (const b of body.content) {
    if (
      b.type !== 'paragraph' ||
      Object.keys(b).some((k) => !['type', 'attrs', 'content'].includes(k)) ||
      !b.attrs ||
      Object.keys(b.attrs).join() !== 'blockId' ||
      (b.content ?? []).some(
        (t) =>
          t.type !== 'text' ||
          Object.keys(t).some((k) => !['type', 'text'].includes(k))
      )
    )
      throw new Fault('UNSUPPORTED_CONTENT');
  }
  return { title: c.title, body, properties: c.properties };
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
    throw new Fault('INVALID_CONTENT');
  }
}
// Shared rebase admission: never hide a locally edited block or delete foreign work.
export function assertBodyRebase(base, draft, latest) {
  const blocks = (body) =>
    new Map(body.content.map((block) => [block.attrs.blockId, block]));
  const b = blocks(base),
    d = blocks(draft),
    l = blocks(latest);
  for (const id of new Set([...b.keys(), ...d.keys()])) {
    const before = b.get(id),
      local = d.get(id),
      remote = l.get(id);
    if (stable(before ?? null) === stable(local ?? null)) continue;
    if (before && local && !remote) throw new Fault('EDITOR_REBASE_CONFLICT');
    if (before && !local && remote && stable(before) !== stable(remote))
      throw new Fault('EDITOR_REBASE_CONFLICT');
  }
}
function mergeUpdate(previous, update) {
  const d = read(previous);
  try {
    const before = projection(d, kind(previous.kind));
    const decoder = createDecoder(update);
    Y.readUpdate(decoder, d);
    if (hasContent(decoder)) throw new Fault('INVALID_UPDATE_ENCODING');
    const fragment = d.getMap('page').get('body');
    for (const block of fragment.toArray()) {
      if (
        !(block instanceof Y.XmlElement) ||
        block.nodeName !== 'paragraph' ||
        Object.keys(block.getAttributes()).some((k) => k !== 'blockId')
      )
        throw new Fault('UNSUPPORTED_CONTENT');
      for (const text of block.toArray())
        if (
          !(text instanceof Y.XmlText) ||
          text
            .toDelta()
            .some(
              (op) =>
                typeof op.insert !== 'string' ||
                (op.attributes && Object.keys(op.attributes).length)
            )
        )
          throw new Fault('UNSUPPORTED_CONTENT');
    }
    if (d.store.pendingStructs || d.store.pendingDs)
      throw new Fault('INCOMPLETE_UPDATE');
    const after = projection(d, kind(previous.kind));
    if (
      stable({
        title: after.title,
        properties: after.properties,
        links: after.links,
      }) !==
      stable({
        title: before.title,
        properties: before.properties,
        links: before.links,
      })
    )
      throw new Fault('EDITOR_SCOPE_VIOLATION');
    content({
      title: after.title,
      properties: after.properties,
      body: {
        format: 'clutter.i1.pm-json',
        schemaVersion: 1,
        value: after.body,
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
        qualifiedEngine.project(base).body.value,
        qualifiedEngine.project(draft).body.value,
        qualifiedEngine.project(latest).body.value
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
          body: {
            format: 'clutter.i1.pm-json',
            schemaVersion: 1,
            value: p.body,
          },
          properties: p.properties,
        };
      } finally {
        d.destroy();
      }
    });
  },
};
