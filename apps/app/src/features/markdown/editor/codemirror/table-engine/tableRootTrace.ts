import { Transaction, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { undoDepth, redoDepth } from '@codemirror/commands';

// Explicit development diagnostics for disposable notes only. A bounded
// in-memory buffer; no file writes or network. Nothing changes editor state.
export function tableRootTrace(engineEnabled: boolean): Extension {
  return ViewPlugin.fromClass(class {
    private readonly doc: Document;
    private readonly panel: HTMLDetailsElement;
    private readonly output: HTMLTextAreaElement;
    private entries: unknown[] = [];
    private readonly listeners = new AbortController();

    constructor(private readonly view: EditorView) {
      this.doc = view.dom.ownerDocument;
      const panel = this.panel = this.doc.createElement('details');
      panel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483646;background:#252525;color:#fff;padding:8px;border:1px solid #888;border-radius:6px;font:12px system-ui;max-width:90vw';
      const summary = this.doc.createElement('summary');
      summary.textContent = 'Table diagnostic — engine ' + (engineEnabled ? 'ON' : 'OFF');
      panel.append(summary);
      const clear = this.doc.createElement('button');
      clear.textContent = 'Clear / start capture';
      clear.onclick = () => { this.entries = []; this.record({ kind: 'start', engineEnabled, widgets: this.view.dom.querySelectorAll('[data-table-engine-cells="true"]').length, source: this.view.state.doc.toString(), undo: undoDepth(this.view.state), redo: redoDepth(this.view.state) }); };
      panel.append(clear);
      const output = this.output = this.doc.createElement('textarea');
      output.readOnly = true;
      output.rows = 12;
      output.style.cssText = 'display:block;width:min(640px,80vw);font:12px monospace';
      panel.append(output);
      panel.addEventListener('toggle', () => this.render());
      this.doc.body.append(panel);
      this.record({ kind: 'mount', engineEnabled, source: view.state.doc.toString() });
      for (const type of ['keydown', 'beforeinput', 'focusin'] as const) {
        this.doc.addEventListener(type, event => {
          const target = event.target;
          if (!(target instanceof Element) || (!view.dom.contains(target) && target !== this.doc.body)) return;
          if (event instanceof KeyboardEvent && !(event.metaKey || event.ctrlKey || event.key === 'Tab')) return;
          const info = { kind: type, target: this.label(target), key: event instanceof KeyboardEvent ? event.key : undefined,
            meta: event instanceof KeyboardEvent ? event.metaKey : undefined,
            shift: event instanceof KeyboardEvent ? event.shiftKey : undefined,
            inputType: event instanceof InputEvent ? event.inputType : undefined };
          // Record arrival synchronously, then final routing outcome separately.
          this.record(info);
          queueMicrotask(() => this.record({ kind: type + ':after', prevented: event.defaultPrevented, focus: this.label(this.doc.activeElement) }));
        }, { capture: true, signal: this.listeners.signal });
      }
    }
    private label(node: Element | null): string {
      return node ? node.tagName + '.' + String(node.className) + (node.closest('[data-cell]')?.getAttribute('data-cell') ?? '') : 'none';
    }
    private render(): void {
      if (this.panel.open) this.output.value = JSON.stringify(this.entries, null, 2);
    }
    private record(entry: unknown): void {
      if (this.listeners.signal.aborted) return;
      this.entries.push(entry);
      if (this.entries.length > 160) this.entries.shift();
      this.render();
    }
    update(update: ViewUpdate): void {
      for (const tr of update.transactions) {
        if (!tr.docChanged) continue;
        this.record({
          kind: 'root-transaction',
          event: tr.annotation(Transaction.userEvent) ?? 'unannotated',
          addToHistory: tr.annotation(Transaction.addToHistory) !== false,
          changes: tr.changes.toJSON(),
          before: tr.startState.doc.toString(),
          after: tr.newDoc.toString(),
          selection: tr.newSelection.main.head,
          undo: undoDepth(tr.state), redo: redoDepth(tr.state),
          widgets: this.view.dom.querySelectorAll('[data-table-engine-cells="true"]').length,
          focus: this.label(this.doc.activeElement),
        });
      }
    }
    destroy(): void { this.listeners.abort(); this.panel.remove(); }
  });
}
