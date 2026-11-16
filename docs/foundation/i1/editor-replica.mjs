import { assertBodyRebase } from '../../../packages/foundation-runtime/src/editor-rebase.ts';
import { Schema } from '../experiments/r07-two-view/node_modules/prosemirror-model/dist/index.js';
// Explicit composition adapter: actual PM/Y views over the new runtime port.
// Temporary supported schema/codec; no legacy app wiring or second save path.
import * as Y from '../experiments/r07-two-view/node_modules/yjs/dist/yjs.mjs';
import {
  EditorState,
  Plugin,
} from '../experiments/r07-two-view/node_modules/prosemirror-state/dist/index.js';
import { EditorView } from '../experiments/r07-two-view/node_modules/prosemirror-view/dist/index.js';
import { keymap } from '../experiments/r07-two-view/node_modules/prosemirror-keymap/dist/index.js';
import { baseKeymap } from '../experiments/r07-two-view/node_modules/prosemirror-commands/dist/index.js';
import {
  ySyncPlugin,
  ySyncPluginKey,
  initProseMirrorDoc,
} from '../experiments/r07-two-view/node_modules/y-prosemirror/src/y-prosemirror.js';
import {
  noteSchema,
  taskSchema,
} from '../experiments/r07-two-view/entities/schema.mjs';
import { OriginHistoryContext } from '../experiments/r07-two-view/src/origin-history-context.mjs';
import {
  fromBase64,
  toBase64,
  Fault,
} from '../../../packages/foundation-runtime/src/contracts.ts';
export function createEditorReplica(
  checkout,
  onLocal,
  nextBlockId = () => crypto.randomUUID(),
  options = {}
) {
  const { read, projection } = options.codec;
  const kind = (k) => (k === 'note' ? 'notes' : 'tasks');
  const doc = read(checkout),
    sourceSchema = checkout.kind === 'note' ? noteSchema : taskSchema,
    schema = new Schema({
      nodes: sourceSchema.spec.nodes.update('paragraph', {
        ...sourceSchema.nodes.paragraph.spec,
        toDOM: (node) => ['p', { 'data-block-id': node.attrs.blockId }, 0],
        parseDOM: [
          {
            tag: 'p',
            getAttrs: (dom) => ({ blockId: dom.getAttribute('data-block-id') }),
          },
        ],
      }),
      marks: sourceSchema.spec.marks,
    }),
    fragment = doc.getMap('page').get('body'),
    history = new OriginHistoryContext(fragment, schema),
    views = new Set(),
    remote = Symbol('accepted-root');
  let disposed = false,
    acceptedBody = projection(doc, kind(checkout.kind)).body;
  const changed = (_update, origin) => {
    if (origin === ySyncPluginKey || origin === history.manager) onLocal();
  };
  doc.on('update', changed);
  const runHistory = (view, direction, historyOptions = {}) => {
    if (options.canEdit?.() === false) return false;
    if (!views.has(view)) throw new Fault('WRONG_CONTEXT_VIEW');
    // Toolbar commands retain this view's current caret/range, mapped through Y.
    // Keyboard undo keeps its established edit-bookmark restoration behavior.
    const bookmark = historyOptions.preserveSelection
      ? history.bookmark(view.state)
      : undefined;
    const changed = history.run(direction, view.state);
    if (changed)
      history.restore(view.state, (tr) => view.dispatch(tr), bookmark);
    return changed;
  };
  return {
    delta(base) {
      const accepted = read(base);
      try {
        return toBase64(
          Y.encodeStateAsUpdate(doc, Y.encodeStateVector(accepted))
        );
      } finally {
        accepted.destroy();
      }
    },
    applyRemote(root) {
      if (root.pageId !== checkout.pageId || root.kind !== checkout.kind)
        throw new Fault('WRONG_DESTINATION');
      const accepted = read(root);
      try {
        const next = projection(accepted, kind(checkout.kind)).body;
        assertBodyRebase(
          acceptedBody,
          projection(doc, kind(checkout.kind)).body,
          next
        );
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(accepted), remote);
        acceptedBody = next;
      } finally {
        accepted.destroy();
      }
    },
    mount(target) {
      if (disposed) throw new Fault('CONTEXT_DISPOSED');
      let view;
      view = new EditorView(target, {
        editable: options.canEdit,
        handleScrollToSelection: options.handleScrollToSelection,
        state: EditorState.create({
          schema,
          doc: initProseMirrorDoc(fragment, schema).doc,
          plugins: [
            ySyncPlugin(fragment),
            history.plugin(),
            keymap({
              'Mod-z': () => {
                runHistory(view, 'undo');
                return true;
              },
              'Mod-Shift-z': () => {
                runHistory(view, 'redo');
                return true;
              },
            }),
            keymap(baseKeymap),
          ],
        }),
        dispatchTransaction(tr) {
          if (
            tr.docChanged &&
            !tr.getMeta(ySyncPluginKey)?.isChangeOrigin &&
            options.canEdit?.() === false
          )
            return;
          // Assign block identities inside the original user transaction. An appended
          // doc-changing transaction would observe a PM state not yet written to Y.
          if (tr.docChanged && !tr.getMeta(ySyncPluginKey)?.isChangeOrigin) {
            const seen = new Set();
            tr.doc.descendants((node, pos) => {
              if (node.isText) return;
              let id = node.attrs.blockId;
              if (!id || seen.has(id)) {
                id = nextBlockId();
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  blockId: id,
                });
              }
              seen.add(id);
            });
          }
          this.updateState(this.state.apply(tr));
        },
      });
      views.add(view);
      const destroy = view.destroy.bind(view);
      view.destroy = () => {
        views.delete(view);
        destroy();
      };
      return view;
    },
    history: runHistory,
    stopCapturing: () => history.manager.stopCapturing(),
    clearHistory: () => history.manager.clear(),
    destroy() {
      if (disposed) return;
      for (const view of [...views]) view.destroy();
      doc.off('update', changed);
      history.destroy();
      doc.destroy();
      disposed = true;
    },
    // Composition-only diagnostics, never a storage authority.
    projection: () => projection(doc, kind(checkout.kind)),
  };
}
