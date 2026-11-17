import * as Y from 'yjs';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { noteSchema, taskSchema } from './schema.mjs';
import { fromBase64 } from '../../core/src/contracts.ts';
import { pageRootPayload } from '../../core/src/root-envelope.ts';
import { pageFields } from '../../core/src/page-fields.ts';
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
