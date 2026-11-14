import { TextSelection } from 'prosemirror-state';

// Experimental public-API adapter. Never waits, flushes private observers, or
// changes focus. It reconciles a native text caret before a key command reads it.
export function reconcileNativeTextSelection(view, event) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    view.composing ||
    event.keyCode === 229 ||
    ['Dead', 'Process'].includes(event.key)
  )
    return { changed: false, reason: 'composition-or-handled' };
  if (!view.hasFocus() || view.dom.ownerDocument.activeElement !== view.dom)
    return { changed: false, reason: 'not-focused-editor' };
  if (!(view.state.selection instanceof TextSelection))
    return { changed: false, reason: 'non-text-model-selection' };
  const native = view.dom.ownerDocument.getSelection();
  if (!native?.anchorNode || !native.focusNode)
    return { changed: false, reason: 'no-native-range' };
  const allowed = (node) => {
    const element = node.nodeType === 1 ? node : node.parentElement;
    return (
      view.dom.contains(node) &&
      !element?.closest(
        '[contenteditable="false"],button,input,textarea,select,[role="combobox"]'
      )
    );
  };
  if (!allowed(native.anchorNode) || !allowed(native.focusNode))
    return { changed: false, reason: 'outside-text-surface' };
  try {
    const anchor = view.posAtDOM(native.anchorNode, native.anchorOffset, -1);
    const head = view.posAtDOM(native.focusNode, native.focusOffset, -1);
    const selection = TextSelection.between(
      view.state.doc.resolve(anchor),
      view.state.doc.resolve(head)
    );
    if (selection.eq(view.state.selection))
      return { changed: false, reason: 'already-aligned' };
    view.dispatch(
      view.state.tr.setSelection(selection).setMeta('addToHistory', false)
    );
    return { changed: true, reason: 'native-text-selection' };
  } catch {
    return { changed: false, reason: 'unresolvable-native-range' };
  }
}
