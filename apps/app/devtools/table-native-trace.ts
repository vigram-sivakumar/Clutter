// Passive diagnostics for the disposable native prototype. No editor
// state, event cancellation, focus changes, or history operations.
const panel = document.querySelector<HTMLElement>('#trace-output')!;
const state = document.querySelector<HTMLElement>('#trace-state')!;
const editor = document.querySelector<HTMLElement>('#editor')!;
const entries: string[] = [];
function label(node: EventTarget | null): string {
  if (!(node instanceof Element)) return String(node);
  const cell = node.closest('td,th') as HTMLTableCellElement | null;
  const row = cell?.parentElement as HTMLTableRowElement | null;
  return node.tagName.toLowerCase() + (node.classList.contains('cm-content') ? '.cm-content' : '') +
    (cell && row ? ' [' + row.rowIndex + ',' + cell.cellIndex + ']' : '');
}
function snapshot(): string {
  const projections = Array.from(editor.querySelectorAll<HTMLElement>('.table-projection'));
  return 'focus=' + label(document.activeElement) + ' | ' + projections.map(p =>
    (p.dataset.interaction ?? '?') + ' selected=' + Array.from(p.querySelectorAll('.cell-selected')).map(label).join(',') +
    ' nested=' + p.querySelectorAll('.cm-editor').length).join(' ; ');
}
function record(message: string) {
  entries.push(message);
  if (entries.length > 80) entries.shift();
  panel.textContent = entries.join('\n');
  state.textContent = snapshot();
}
for (const type of ['keydown','mousedown','click','focusin','beforeinput'] as const) {
  document.addEventListener(type, event => {
    if (!(event.target instanceof Node) || !editor.contains(event.target)) return;
    const detail = event instanceof KeyboardEvent ? event.key + ' shift=' + event.shiftKey + ' meta=' + event.metaKey :
      event instanceof MouseEvent ? 'shift=' + event.shiftKey : event instanceof InputEvent ? event.inputType : '';
    const target = label(event.target);
    queueMicrotask(() => record(type + ' ' + detail + ' target=' + target + ' prevented=' + event.defaultPrevented + ' => ' + snapshot()));
  }, true);
}
document.querySelector('#trace-clear')!.addEventListener('click', () => { entries.length = 0; panel.textContent = ''; state.textContent = snapshot(); });
state.textContent = snapshot();
