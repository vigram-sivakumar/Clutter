// Temporary I1a composition adapter; not a production codec or feature schema.
import {
  fresh,
  encode,
  decode,
  projection,
  apply,
} from '../experiments/r07-two-view/pages/codec.mjs';
import { Fault } from '../../../packages/foundation-runtime/src/contracts.ts';
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
export const qualifiedEngine = {
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
