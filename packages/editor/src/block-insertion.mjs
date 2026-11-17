import {
  Plugin,
  PluginKey,
  TextSelection,
  NodeSelection,
} from 'prosemirror-state';
import { ySyncPluginKey } from 'y-prosemirror';
import {
  blockDefinitions,
  createBlockDefinitions,
} from './block-definitions.mjs';
import { afterSubtree } from './block-structure.mjs';
export const blockCommands = blockDefinitions;
const key = new PluginKey('block-insertion');
function queryAt(state, definitions = blockDefinitions) {
  const { $from, empty } = state.selection;
  if (
    !empty ||
    $from.depth !== 1 ||
    !$from.parent.isTextblock ||
    $from.index(0) === 0
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
  const items = definitions.filter((c) =>
    c.terms.some((term) => term.startsWith(query))
  );
  if (!items.length) return null;
  return { from: $from.start() + slash, to: $from.pos, query, items, index: 0 };
}
function targetType(schema, definition) {
  const type = schema.nodes[definition.nodeType],
    policy = definition.insertion;
  if (
    !type ||
    (policy.focus === 'inserted' && !type.isTextblock) ||
    (policy.focus === 'selected' &&
      (!type.isBlock ||
        !type.isAtom ||
        !NodeSelection.isSelectable(type.create(definition.attrs)))) ||
    (policy.nonEmpty === 'convert' && !type.isTextblock)
  )
    throw Error('UNSUPPORTED_BLOCK_INSERTION_POLICY');
  return type;
}
// Slash adapter validates its live trigger; all placement/focus is delegated.
export function insertBlock(
  state,
  commandId,
  range,
  nextId,
  definitions = blockDefinitions
) {
  const current = queryAt(state, definitions);
  if (
    !current ||
    current.from !== range.from ||
    current.to !== range.to ||
    current.query !== range.query
  )
    return null;
  return createInsertionTransaction(state, commandId, nextId, {
    definitions,
    removeRange: range,
  });
}
// Shared by slash and future insertion controls. Without a trigger range, existing
// text/selection is not deleted. No command-ID conditions or UI/OS/save mechanisms.
export function createInsertionTransaction(
  state,
  commandId,
  nextId,
  { definitions = blockDefinitions, removeRange } = {}
) {
  const definition = definitions.find((d) => d.id === commandId);
  if (!definition) return null;
  const range = removeRange ?? {
    from: state.selection.from,
    to: state.selection.from,
  };
  if (range.from > range.to) return null;
  const $at = state.doc.resolve(range.from),
    $end = state.doc.resolve(range.to);
  if (
    $at.depth !== 1 ||
    $at.index(0) === 0 ||
    !$at.parent.isTextblock ||
    !$at.sameParent($end)
  )
    return null;
  const type = targetType(state.schema, definition),
    policy = definition.insertion;
  const $from = state.doc.resolve(range.from),
    start = $from.before(),
    id = $from.parent.attrs.blockId;
  const after = afterSubtree(state.doc, id),
    tr = state.tr.delete(range.from, range.to),
    source = tr.doc.nodeAt(start);
  const action = source.content.size === 0 ? policy.empty : policy.nonEmpty;
  const attrs = {
    ...(type.isTextblock
      ? { background: source.attrs.background ?? null }
      : {}),
    indent: source.attrs.indent,
    parentId: source.attrs.parentId,
    ...definition.attrs,
  };
  let target;
  if (action === 'convert') {
    target = start;
    tr.setNodeMarkup(start, type, { ...attrs, blockId: id });
  } else {
    target = action === 'before' ? start : tr.mapping.map(after, -1);
    tr.insert(target, type.create({ ...attrs, blockId: nextId() }));
  }
  if (policy.focus === 'selected')
    tr.setSelection(NodeSelection.create(tr.doc, target)).scrollIntoView();
  if (policy.focus === 'inserted' && action !== 'convert')
    tr.setSelection(TextSelection.create(tr.doc, target + 1))
      .setStoredMarks([])
      .scrollIntoView();
  if (policy.focus === 'inserted') tr.scrollIntoView();
  return tr.setMeta(key, { close: true, insertion: true, focus: policy.focus });
}
export const insertionWantsFocus = (tr) =>
  ['inserted', 'selected'].includes(tr.getMeta(key)?.focus);
export const isInsertionTransaction = (tr) =>
  tr.getMeta(key)?.insertion === true;
export function blockInsertion({
  nextId,
  canEdit,
  renderMenu,
  insertionPolicies,
} = {}) {
  const definitions = createBlockDefinitions(insertionPolicies);
  return new Plugin({
    key,
    state: {
      init: (_config, state) => {
        for (const definition of definitions)
          targetType(state.schema, definition);
        return null;
      },
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
          const next = queryAt(state, definitions);
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
          $from.parent.type.name !== 'list_item' &&
          !$from.parent.attrs.indent &&
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
    const tr = insertBlock(view.state, id, range, nextId, definitions);
    if (!tr) return false;
    view.dispatch(tr);
    return true;
  }
}
