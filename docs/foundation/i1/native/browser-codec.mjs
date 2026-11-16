import * as Y from '../../experiments/r07-two-view/node_modules/yjs/dist/yjs.mjs';
import { yXmlFragmentToProseMirrorRootNode } from '../../experiments/r07-two-view/node_modules/y-prosemirror/src/y-prosemirror.js';
import {
  noteSchema,
  taskSchema,
} from '../../experiments/r07-two-view/entities/schema.mjs';
import { fromBase64 } from '../../../../packages/foundation-runtime/src/contracts.ts';
import { pageRootPayload } from '../../../../packages/foundation-runtime/src/root-envelope.ts';
import { pageFields } from '../../../../packages/foundation-runtime/src/page-fields.ts';
// CoreClient verifies SHA-256 before a checkout reaches this synchronous codec.
export const browserCodec = {
  read(root) {
    const d = new Y.Doc();
    try {
      Y.applyUpdate(
        d,
        pageRootPayload(
          fromBase64(root.payload),
          root.pageId,
          root.kind === 'note' ? 'notes' : 'tasks'
        )
      );
      return d;
    } catch (e) {
      d.destroy();
      throw e;
    }
  },
  projection(doc, kind) {
    return pageFields(doc, (fragment) =>
      yXmlFragmentToProseMirrorRootNode(
        fragment,
        kind === 'notes' ? noteSchema : taskSchema
      ).toJSON()
    );
  },
};
