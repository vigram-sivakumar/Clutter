// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useEscape } from '@components/overlay/hooks/useEscape';
import { CollectionCard } from '../components/card/CollectionCard';
import { CollectionEntry } from '../components/entry/CollectionEntry';
import { CollectionDataList } from '../components/list/CollectionDataList';
import { CollectionDataTable } from '../components/table/CollectionDataTable';
import { useCollectionSelection } from './useCollectionSelection';

afterEach(cleanup);

const IDS = ['a', 'b'];
const COLUMNS = [{ id: 'name', label: 'Name', width: '1fr' }] as never;
const onOpen = vi.fn();

/** Each layout, driven by the real selection hook the collection bodies use. */
function List() {
  const { selectionFor } = useCollectionSelection(IDS);
  return (
    <CollectionDataList
      items={IDS.map((id) => ({ id, icon: 'note', title: `Note ${id}`, onClick: onOpen, selection: selectionFor(id, `Note ${id}`) }))}
    />
  );
}
function Table() {
  const { selectionFor } = useCollectionSelection(IDS);
  return (
    <CollectionDataTable
      columns={COLUMNS}
      rows={IDS.map((id) => ({
        id,
        cells: { name: { variant: 'header', icon: 'note', title: `Note ${id}` } },
        onClick: onOpen,
        selection: selectionFor(id, `Note ${id}`),
      }))}
    />
  );
}
function Folders() {
  const { selectionFor } = useCollectionSelection(IDS);
  return (
    <>
      {IDS.map((id) => (
        <CollectionEntry
          key={id}
          layout="cell"
          className="collection-entry--folder-card"
          leading={<span>icon</span>}
          title={`Folder ${id}`}
          onClick={onOpen}
          selection={selectionFor(id, `Folder ${id}`)}
        />
      ))}
    </>
  );
}
function Cards() {
  const { selectionFor } = useCollectionSelection(IDS);
  return (
    <>
      {IDS.map((id) => (
        <CollectionCard key={id} header={`Card ${id}`} onClick={onOpen} selection={selectionFor(id, `Card ${id}`)} />
      ))}
    </>
  );
}

const boxes = () => screen.getAllByRole('checkbox', { hidden: true });
const states = () => boxes().map((box) => box.getAttribute('aria-checked'));
const escape = (target: Element | Document = document.body, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key: 'Escape', ...init });

/** Everything that says "selected" or "in selection mode", in any layout: checked state, selected styling, mode. */
const selectionMarkers = (container: HTMLElement) =>
  container.querySelectorAll('[class*="--checked"], [class*="--selected"], [class*="--selecting"], [aria-checked="true"]');

describe.each([
  ['list rows', List],
  ['table rows', Table],
  ['folder cards', Folders],
  ['note and asset cards', Cards],
] as const)('Escape in %s', (_name, Layout) => {
  it('with one item selected, clears it and leaves selection mode — checkboxes, styling and mode all reset', () => {
    const { container } = render(<Layout />);
    fireEvent.click(boxes()[0]!);
    expect(states()).toEqual(['true', 'false']);
    expect(selectionMarkers(container).length).toBeGreaterThan(0);

    escape();

    expect(states()).toEqual(['false', 'false']);
    expect(selectionMarkers(container)).toHaveLength(0);
  });

  it('with several items selected, clears all of them', () => {
    const { container } = render(<Layout />);
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[1]!);
    expect(states()).toEqual(['true', 'true']);

    escape();

    expect(states()).toEqual(['false', 'false']);
    expect(selectionMarkers(container)).toHaveLength(0);
  });

  it('with nothing selected, changes nothing: it does not register a handler and does not consume the key', () => {
    const addWindow = vi.spyOn(window, 'addEventListener');
    const addDocument = vi.spyOn(document, 'addEventListener');
    const { container } = render(<Layout />);

    const notPrevented = escape();

    // `fireEvent` returns false when a handler called preventDefault.
    expect(notPrevented).toBe(true);
    expect(states()).toEqual(['false', 'false']);
    expect(selectionMarkers(container)).toHaveLength(0);
    expect(addWindow.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
    expect(addDocument.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
    addWindow.mockRestore();
    addDocument.mockRestore();
  });

  it('leaves the item opening again with a plain click, as before any selection', () => {
    onOpen.mockClear();
    const { container } = render(<Layout />);
    fireEvent.click(boxes()[0]!);
    escape();

    fireEvent.click(container.querySelector('[role="button"]')!);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('selecting again after an Escape works, and Escape clears it again', () => {
    render(<Layout />);
    fireEvent.click(boxes()[0]!);
    escape();
    fireEvent.click(boxes()[1]!);
    expect(states()).toEqual(['false', 'true']);

    escape();

    expect(states()).toEqual(['false', 'false']);
  });
});

describe('Escape stands aside for whatever else answers it', () => {
  /** A dialog open the way every real overlay is: registered with `useEscape`, closing itself on Escape. */
  function Dialog({ onClose, sync = false }: { onClose: () => void; sync?: boolean }) {
    const [open, setOpen] = useState(true);
    useEscape({
      open,
      onClose: () => {
        // `sync` closes it the way a browser does between two listeners of one key press: it is gone from the overlay
        // list before the next listener (the selection's) runs.
        if (sync) flushSync(() => setOpen(false));
        else setOpen(false);
        onClose();
      },
    });
    return open ? <div role="dialog">dialog</div> : null;
  }

  it('an open overlay takes the key: it closes, the selection stays, and the next Escape clears it', () => {
    const onClose = vi.fn();
    render(
      <>
        <List />
        <Dialog onClose={onClose} />
      </>
    );
    fireEvent.click(boxes()[0]!);

    escape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(states()).toEqual(['true', 'false']);

    escape();

    expect(states()).toEqual(['false', 'false']);
  });

  it('even when the overlay has already left the list by the time the selection’s listener runs', () => {
    const onClose = vi.fn();
    render(
      <>
        <List />
        <Dialog onClose={onClose} sync />
      </>
    );
    fireEvent.click(boxes()[0]!);

    escape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(states()).toEqual(['true', 'false']);
  });

  it('whichever was registered first: an overlay open before the selection started still owns the key', () => {
    render(
      <>
        <Dialog onClose={vi.fn()} sync />
        <List />
      </>
    );
    fireEvent.click(boxes()[0]!);

    escape();

    expect(states()).toEqual(['true', 'false']);
  });

  it('an overlay that was open and is closed again no longer holds the selection back', () => {
    const { rerender } = render(
      <>
        <List />
        <Dialog onClose={vi.fn()} />
      </>
    );
    fireEvent.click(boxes()[0]!);
    rerender(<List />);

    escape();

    expect(states()).toEqual(['false', 'false']);
  });

  it.each([
    ['a text field', () => <input aria-label="rename" />],
    ['a textarea', () => <textarea aria-label="notes" />],
    ['a select', () => <select aria-label="pick" />],
    ['an editable element', () => <div contentEditable suppressContentEditableWarning aria-label="editable" />],
    ['an editor', () => (
      <div className="cm-editor">
        <div className="cm-content" tabIndex={0} aria-label="editor" />
      </div>
    )],
  ] as const)('a key pressed in %s is that control’s own: the selection stays', (_label, field) => {
    render(
      <>
        <List />
        {field()}
      </>
    );
    fireEvent.click(boxes()[0]!);
    const target = screen.getByLabelText(/rename|notes|pick|editable|editor/);

    escape(target);

    expect(states()).toEqual(['true', 'false']);
  });

  it('leaves the selection alone when something has already handled the key (defaultPrevented)', () => {
    render(<List />);
    fireEvent.click(boxes()[0]!);
    // The cover's repositioning, for one: a document-level handler that consumes Escape.
    const handler = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener('keydown', handler);

    escape();

    document.removeEventListener('keydown', handler);
    expect(states()).toEqual(['true', 'false']);
  });

  it('leaves it alone while a drag or marquee consumes the key before it arrives (capture phase, stopPropagation)', () => {
    render(<List />);
    fireEvent.click(boxes()[0]!);
    // Registered the way `usePointerDrag` and `useMarqueeSelection` register theirs, after the selection's.
    const consume = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('keydown', consume, true);

    escape();

    document.removeEventListener('keydown', consume, true);
    expect(states()).toEqual(['true', 'false']);
  });

  it.each([
    ['Shift', { shiftKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Cmd', { metaKey: true }],
  ])('with %s held it is not a plain Escape: the selection stays', (_label, modifier) => {
    render(<List />);
    fireEvent.click(boxes()[0]!);

    escape(document.body, modifier);

    expect(states()).toEqual(['true', 'false']);
  });

  it('ignores an Escape that ends an IME composition', () => {
    render(<List />);
    fireEvent.click(boxes()[0]!);

    escape(document.body, { isComposing: true });

    expect(states()).toEqual(['true', 'false']);
  });

  it('ignores every other key', () => {
    render(<List />);
    fireEvent.click(boxes()[0]!);

    for (const key of ['Enter', 'Backspace', 'Delete', 'Tab', 'a', ' ']) {
      fireEvent.keyDown(document.body, { key });
    }

    expect(states()).toEqual(['true', 'false']);
  });
});

describe('the Escape handlers are registered and cleaned up exactly once', () => {
  const keydown = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([type]) => type === 'keydown').length;

  it('adds one pair of listeners while selection mode is on, removes them when it ends and when the body unmounts', () => {
    const addWindow = vi.spyOn(window, 'addEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const addDocument = vi.spyOn(document, 'addEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<List />);

    // Nothing selected: nothing registered.
    expect(keydown(addWindow) + keydown(addDocument)).toBe(0);

    // Turn the mode on and off three times (by clicking and by Escape): never more than one pair live at a time.
    for (let round = 0; round < 3; round += 1) {
      fireEvent.click(boxes()[0]!);
      expect(keydown(addWindow) - keydown(removeWindow)).toBe(1);
      expect(keydown(addDocument) - keydown(removeDocument)).toBe(1);
      if (round % 2 === 0) {
        escape();
      } else {
        fireEvent.click(boxes()[0]!);
      }
      expect(keydown(addWindow) - keydown(removeWindow)).toBe(0);
      expect(keydown(addDocument) - keydown(removeDocument)).toBe(0);
    }

    // Unmounting in the middle of the mode removes them too.
    fireEvent.click(boxes()[0]!);
    expect(keydown(addWindow) - keydown(removeWindow)).toBe(1);
    unmount();
    expect(keydown(addWindow) - keydown(removeWindow)).toBe(0);
    expect(keydown(addDocument) - keydown(removeDocument)).toBe(0);

    for (const spy of [addWindow, removeWindow, addDocument, removeDocument]) spy.mockRestore();
  });

  it('two bodies at once register one pair each, and an Escape clears both without either breaking the other', () => {
    render(
      <>
        <List />
        <Cards />
      </>
    );
    const all = boxes();
    fireEvent.click(all[0]!);
    fireEvent.click(all[2]!);
    expect(states()).toEqual(['true', 'false', 'true', 'false']);

    escape();

    expect(states()).toEqual(['false', 'false', 'false', 'false']);
  });
});
