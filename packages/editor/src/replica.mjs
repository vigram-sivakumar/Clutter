import { textFormatting, isFormattingTransaction } from './formatting.mjs';
import { guardNodeSelections } from './node-selection-bridge.mjs';
import { objectInteractions } from './object-interactions.mjs';
import { blockIndentation } from './block-indentation.mjs';
import { listInteractions } from './list-interactions.mjs';
import {
  blockInsertion,
  isInsertionTransaction,
  insertionWantsFocus,
} from './block-insertion.mjs';
import { titleInteractions } from './title-interactions.mjs';
import { assertBodyRebase } from '../../core/src/editor-rebase.ts';
// Explicit composition adapter: actual PM/Y views over the new runtime port.
// One title/body document; no mirrored React value or second save path.
import * as Y from 'yjs';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { ySyncPlugin, ySyncPluginKey, initProseMirrorDoc } from 'y-prosemirror';
import { noteSchema, taskSchema } from './schema.mjs';
import { OriginHistoryContext } from './origin-history-context.mjs';
import { toBase64, Fault } from '../../core/src/contracts.ts';
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
    schema = sourceSchema,
    fragment = doc.getMap('page').get('content'),
    history = new OriginHistoryContext(fragment, schema),
    views = new Set(),
    remote = Symbol('accepted-root'),
    selectionOwner = Symbol('view-selection-owner');
  const releaseNodeSelections = guardNodeSelections(doc, views);
  let disposed = false,
    acceptedBody = projection(doc, kind(checkout.kind)).content;
  const changed = (_update, origin) => {
    if (origin === ySyncPluginKey || origin === history.manager) onLocal();
    options.onProjection?.(projection(doc, kind(checkout.kind)));
  };
  doc.on('update', changed);
  // Native selectionchange can lag a visible click. Before a toolbar bookmark,
  // reconcile only this focused view's text selection through public PM APIs.
  // Cell/node/all selections and another editor's DOM selection remain untouched.
  const adoptVisibleTextSelection = (view) => {
    if (!(view.state.selection instanceof TextSelection) || !view.hasFocus())
      return;
    const root = view.root;
    const selection =
      typeof root.getSelection === 'function'
        ? root.getSelection()
        : view.dom.ownerDocument.getSelection();
    if (
      !selection ||
      selection.rangeCount !== 1 ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !view.dom.contains(selection.anchorNode) ||
      !view.dom.contains(selection.focusNode)
    )
      return;
    let next;
    try {
      const anchor = view.posAtDOM(
        selection.anchorNode,
        selection.anchorOffset
      );
      const head = view.posAtDOM(selection.focusNode, selection.focusOffset);
      next = TextSelection.between(
        view.state.doc.resolve(anchor),
        view.state.doc.resolve(head)
      );
    } catch {
      return;
    } // Unmapped/retired DOM cannot replace valid model state.
    if (!next.eq(view.state.selection))
      view.dispatch(
        view.state.tr.setSelection(next).setMeta('addToHistory', false)
      );
  };
  const runHistory = (view, direction, historyOptions = {}) => {
    if (options.canEdit?.() === false) return false;
    if (!views.has(view)) throw new Fault('WRONG_CONTEXT_VIEW');
    if (historyOptions.preserveSelection) adoptVisibleTextSelection(view);
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
        const next = projection(accepted, kind(checkout.kind)).content;
        assertBodyRebase(
          acceptedBody,
          projection(doc, kind(checkout.kind)).content,
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
            textFormatting({
              canEdit: options.canEdit,
              renderToolbar: options.renderFormattingToolbar,
            }),
            blockInsertion({
              nextId: nextBlockId,
              canEdit: options.canEdit,
              renderMenu: options.renderSlashMenu,
              insertionPolicies: options.insertionPolicies,
            }),
            objectInteractions({
              nextId: nextBlockId,
              canEdit: options.canEdit,
              stopCapturing: () => history.manager.stopCapturing(),
            }),
            blockIndentation({
              canEdit: options.canEdit,
              stopCapturing: () => history.manager.stopCapturing(),
            }),
            listInteractions({
              nextId: nextBlockId,
              canEdit: options.canEdit,
              stopCapturing: () => history.manager.stopCapturing(),
            }),
            titleInteractions(nextBlockId, options.canEdit),
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
              if (!node.isBlock) return;
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
          const localAction =
            (isInsertionTransaction(tr) || isFormattingTransaction(tr)) &&
            !tr.getMeta(ySyncPluginKey)?.isChangeOrigin;
          if (localAction) history.manager.stopCapturing();
          this.updateState(this.state.apply(tr));
          if (localAction) {
            history.manager.stopCapturing();
            if (insertionWantsFocus(tr) || isFormattingTransaction(tr))
              this.focus();
          }
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
    captureSelection(view) {
      if (!views.has(view)) throw new Fault('WRONG_CONTEXT_VIEW');
      adoptVisibleTextSelection(view);
      return Object.freeze({
        owner: selectionOwner,
        bookmark: history.bookmark(view.state),
      });
    },
    restoreSelection(view, value) {
      if (!views.has(view) || value?.owner !== selectionOwner)
        throw new Fault('WRONG_CONTEXT_VIEW');
      return history.restore(
        view.state,
        (tr) => view.dispatch(tr),
        value.bookmark
      );
    },
    history: runHistory,
    stopCapturing: () => history.manager.stopCapturing(),
    clearHistory: () => history.manager.clear(),
    destroy() {
      if (disposed) return;
      for (const view of [...views]) view.destroy();
      doc.off('update', changed);
      history.destroy();
      releaseNodeSelections();
      doc.destroy();
      disposed = true;
    },
    // Composition-only diagnostics, never a storage authority.
    projection: () => projection(doc, kind(checkout.kind)),
  };
}
