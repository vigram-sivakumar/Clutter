import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { ySyncPluginKey } from 'y-prosemirror';
export const blockCommands = Object.freeze([
  { id: 'paragraph', label: 'Paragraph', terms: ['paragraph', 'text', 'p'] },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    id: 'heading-' + level,
    label: 'Heading ' + level,
    level,
    terms: ['heading ' + level, 'heading' + level, 'h' + level],
  })),
  {
    id: 'separator',
    label: 'Separator',
    terms: ['separator', 'divider', 'line'],
  },
]);
const key = new PluginKey('block-insertion');
function queryAt(state) {
  const { $from, empty } = state.selection;
  if (
    !empty ||
    $from.depth !== 1 ||
    !['paragraph', 'heading'].includes($from.parent.type.name)
  )
    return null;
  if ($from.marks().some((m) => m.type.name === 'link')) return null;
  // Inline atoms occupy one position. A separator character preserves text offsets.
  const before = $from.parent.textBetween(0, $from.parentOffset, '', '\ufffc');
  const slash = before.lastIndexOf('/');
  if (slash < 0) return null;
  const token = before.slice(0, slash).split(/\s/).at(-1);
  if (
    /(?:^|[([{<"'=])(?:[a-z][a-z\d+.-]*:|www\.|(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?)/i.test(
      token
    )
  )
    return null;
  const query = before.slice(slash + 1).toLowerCase();
  const items = blockCommands.filter((c) =>
    c.terms.some((term) => term.startsWith(query))
  );
  if (!items.length) return null;
  return { from: $from.start() + slash, to: $from.pos, query, items, index: 0 };
}
// Deterministic structural transform; UI supplies intent, never a second document.
export function insertBlock(state, commandId, range, nextId) {
  const command = blockCommands.find((c) => c.id === commandId),
    current = queryAt(state);
  if (
    !command ||
    !current ||
    current.from !== range.from ||
    current.to !== range.to ||
    current.query !== range.query
  )
    return null;
  const $from = state.doc.resolve(range.from),
    node = $from.parent,
    start = $from.before(),
    end = start + node.nodeSize;
  const prefix = node.content.cut(0, range.from - start - 1),
    suffix = node.content.cut(range.to - start - 1);
  const attrs = {
    blockId: nextId(),
    indent: node.attrs.indent,
    parentId: node.attrs.parentId,
  };
  const inserted = command.level
    ? state.schema.nodes.heading.create({ ...attrs, level: command.level })
    : state.schema.nodes[command.id].create(attrs);
  // Keep existing children attached to the original prefix. Place new siblings after
  // that visual group; no child identities, parent references or order are rewritten.
  let after = end;
  for (let i = $from.index(0) + 1; i < state.doc.childCount; i++) {
    const child = state.doc.child(i);
    if (child.attrs.indent <= node.attrs.indent) break;
    after += child.nodeSize;
  }
  const tail = suffix.size
    ? node.type.create({ ...node.attrs, blockId: nextId() }, suffix)
    : null;
  const tr = state.tr.replaceWith(
    start,
    end,
    node.type.create(node.attrs, prefix)
  );
  tr.insert(tr.mapping.map(after, -1), tail ? [inserted, tail] : inserted);
  // The cursor stays with the original prefix, never jumps into the inserted block.
  return tr
    .setSelection(TextSelection.create(tr.doc, start + 1 + prefix.size))
    .setMeta(key, { close: true });
}
export function blockInsertion({
  nextId,
  canEdit,
  stopCapturing,
  renderMenu,
} = {}) {
  return new Plugin({
    key,
    state: {
      init: () => null,
      apply(tr, previous, _old, state) {
        const intent = tr.getMeta(key);
        if (intent?.close) return null;
        if (intent?.index !== undefined && previous)
          return { ...previous, index: intent.index };
        const remote = tr.getMeta(ySyncPluginKey)?.isChangeOrigin;
        if (
          (tr.docChanged && !remote) ||
          (previous && (tr.docChanged || tr.selectionSet))
        ) {
          const next = queryAt(state);
          if (next && previous?.query === next.query)
            next.index = Math.min(previous.index, next.items.length - 1);
          return next;
        }
        return previous;
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (canEdit?.() === false || event.isComposing || view.composing)
          return false;
        const menu = key.getState(view.state);
        if (menu) {
          if (event.key === 'Escape') {
            dismiss(view);
            return true;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const index =
              (menu.index +
                (event.key === 'ArrowDown' ? 1 : -1) +
                menu.items.length) %
              menu.items.length;
            view.dispatch(
              view.state.tr
                .setMeta(key, { index })
                .setMeta('addToHistory', false)
            );
            return true;
          }
          if (event.key === 'Enter' && !event.shiftKey)
            return choose(view, menu.items[menu.index].id, menu);
        }
        const { $from, empty } = view.state.selection;
        if (
          event.key === 'Backspace' &&
          empty &&
          $from.depth === 1 &&
          $from.parent.isTextblock &&
          $from.parent.type.name !== 'title' &&
          $from.parentOffset === 0
        ) {
          if ($from.index(0) === 1) {
            view.dispatch(
              view.state.tr
                .setSelection(
                  TextSelection.create(
                    view.state.doc,
                    view.state.doc.firstChild.nodeSize - 1
                  )
                )
                .setMeta('addToHistory', false)
            );
            return true;
          }
          if (!view.state.doc.child($from.index(0) - 1).isTextblock)
            return true;
        }
        return false;
      },
      handleDOMEvents: {
        blur(view) {
          dismiss(view);
          return false;
        },
      },
    },
    view(view) {
      const renderer = renderMenu?.({ document: view.dom.ownerDocument });
      const update = () => {
        const menu = key.getState(view.state);
        if (!menu || !view.hasFocus() || view.dom.closest('[inert]')) {
          renderer?.update(null);
          return;
        }
        let rect;
        try {
          rect = view.coordsAtPos(menu.from);
        } catch {
          rect = view.dom.getBoundingClientRect();
        }
        renderer?.update({
          items: menu.items.map(({ id, label }) => ({ id, label })),
          selected: menu.index,
          left: rect.left,
          top: rect.bottom,
          choose: (id) => choose(view, id, menu),
          dismiss: () => dismiss(view),
        });
      };
      const outside = (event) => {
        if (
          !view.dom.contains(event.target) &&
          !renderer?.contains?.(event.target)
        )
          dismiss(view);
      };
      const doc = view.dom.ownerDocument;
      doc.addEventListener('pointerdown', outside, true);
      doc.addEventListener('scroll', update, true);
      doc.defaultView?.addEventListener('resize', update);
      update();
      return {
        update,
        destroy() {
          doc.removeEventListener('pointerdown', outside, true);
          doc.removeEventListener('scroll', update, true);
          doc.defaultView?.removeEventListener('resize', update);
          renderer?.destroy();
        },
      };
    },
  });
  function dismiss(view) {
    if (key.getState(view.state))
      view.dispatch(
        view.state.tr
          .setMeta(key, { close: true })
          .setMeta('addToHistory', false)
      );
  }
  function choose(view, id, range) {
    if (canEdit?.() === false) return false;
    const tr = insertBlock(view.state, id, range, nextId);
    if (!tr) return false;
    stopCapturing?.();
    view.dispatch(tr);
    stopCapturing?.();
    return true;
  }
}
