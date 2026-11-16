import { decode, projection } from './page-codec.mjs';
import { createEditorReplica } from './replica.mjs';
import { fromBase64 } from '../contracts.ts';
const kind = (k) => (k === 'note' ? 'notes' : 'tasks');
const read = (r) =>
  decode({
    pageId: r.pageId,
    kind: kind(r.kind),
    bytes: fromBase64(r.payload),
    hash: r.head,
  });
export function createQualifiedReplica(
  checkout,
  onLocal,
  nextBlockId = () => crypto.randomUUID(),
  options = {}
) {
  return createEditorReplica(checkout, onLocal, nextBlockId, {
    ...options,
    codec: { read, projection },
  });
}
