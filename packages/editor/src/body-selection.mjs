import { Selection, SelectionRange, AllSelection } from 'prosemirror-state';
import { Slice, Fragment } from 'prosemirror-model';
import { blockRows } from './block-structure.mjs';
// The single view-local explicit body-block selection model. Keyboard, paste and
// marquee adapters choose IDs; neither hierarchy nor DOM owns membership.
export class BodyBlockSelection extends Selection {
  constructor(doc, ids = []) {
    const requested = new Set(ids),
      rows = blockRows(doc).filter(({ node }) =>
        requested.has(node.attrs.blockId)
      );
    const at = doc.firstChild.nodeSize;
    const ranges = rows.map(
      ({ node, pos }) =>
        new SelectionRange(doc.resolve(pos), doc.resolve(pos + node.nodeSize))
    );
    super(
      ranges[0]?.$from ?? doc.resolve(at),
      ranges.at(-1)?.$to ?? doc.resolve(at),
      ranges.length ? ranges : undefined
    );
    this.ids = Object.freeze(rows.map(({ node }) => node.attrs.blockId));
  }
  map(doc) {
    return new BodyBlockSelection(doc, this.ids);
  }
  eq(other) {
    return (
      other instanceof BodyBlockSelection &&
      this.ids.length === other.ids.length &&
      this.ids.every((id, i) => id === other.ids[i])
    );
  }
  content() {
    const ids = new Set(this.ids);
    return new Slice(
      Fragment.from(
        blockRows(this.$from.doc)
          .filter(({ node }) => ids.has(node.attrs.blockId))
          .map(({ node }) => node)
      ),
      0,
      0
    );
  }
  toJSON() {
    return { type: 'body-blocks', ids: [...this.ids] };
  }
  static fromJSON(doc, json) {
    if (
      !Array.isArray(json.ids) ||
      json.ids.some((id) => typeof id !== 'string')
    )
      throw Error('INVALID_BODY_SELECTION');
    return new BodyBlockSelection(doc, json.ids);
  }
  getBookmark() {
    const ids = this.ids;
    return {
      map() {
        return this;
      },
      resolve(doc) {
        return new BodyBlockSelection(doc, ids);
      },
    };
  }
}
BodyBlockSelection.prototype.visible = false;
Selection.jsonID('body-blocks', BodyBlockSelection);
export const selectBodyBlocks = (state, ids) =>
  state.tr.setSelection(new BodyBlockSelection(state.doc, ids));

export function isBlockToggleModifier(event, platform) {
  return /Mac|iP(hone|[oa]d)/.test(platform) ? event.metaKey : event.ctrlKey;
}

export function toggleBlockId(ids, id) {
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
}

export function focusBlockSelection(view) {
  if (view.hasFocus()) return;
  if (view.editable) view.focus();
  else view.dom.focus({ preventScroll: true });
}

// Internal Y protection still serializes as AllSelection, but its DOM presentation
// stays in the originating block mode. It is not another persisted selection owner.
export class BodySelectionShield extends AllSelection {
  constructor(doc, ids) {
    super(doc);
    this.ids = ids;
  }
  map(doc) {
    return new BodySelectionShield(doc, this.ids);
  }
  eq(other) {
    return (
      other instanceof BodySelectionShield &&
      this.ids.length === other.ids.length &&
      this.ids.every((id, i) => id === other.ids[i])
    );
  }
}
BodySelectionShield.prototype.visible = false;
export const presentsBodySelection = (selection) =>
  selection instanceof BodyBlockSelection ||
  selection instanceof BodySelectionShield;

export const isInactiveBodySelection = (selection) =>
  presentsBodySelection(selection) && selection.ids.length === 0;
