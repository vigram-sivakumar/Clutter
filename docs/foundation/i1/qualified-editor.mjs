import {
  decode,
  projection,
} from '../experiments/r07-two-view/pages/codec.mjs';
import { createEditorReplica } from './editor-replica.mjs';
import { fromBase64 } from '../../../packages/foundation-runtime/src/contracts.ts';
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
