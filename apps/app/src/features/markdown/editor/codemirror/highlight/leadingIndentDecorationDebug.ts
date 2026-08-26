import { Transaction, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';

import { DEBUG_LEADING_INDENT, leadingIndentDecorationPlugin } from './leadingIndentDecoration';

/**
 * TEMPORARY diagnostic instrumentation for the live-typing DOM-divergence
 * investigation (phantom trailing text node after `.cm-indent` reuse) —
 * NOT a fix, NOT a behavior change, purely observational logging gated
 * behind `DEBUG_LEADING_INDENT` (re-exported from `leadingIndentDecoration.ts`,
 * the single flag controlling every log block added for this
 * investigation). Delete this file and its wiring in `MarkdownEditor.tsx`,
 * plus the flag/log blocks in `leadingIndentDecoration.ts`, once the
 * investigation concludes.
 *
 * Scoped to the *affected line* — the physical line containing the
 * selection head after each update — rather than the whole document, per
 * the explicit "don't flood the console" requirement. Only logs on
 * `docChanged` updates (a pure selection/scroll move isn't part of this
 * reproduction).
 */
let updateCount = 0;

function describeNode(node: Node): unknown {
  if (node.nodeType === Node.TEXT_NODE) {
    return { kind: 'text', text: JSON.stringify(node.textContent) };
  }
  const el = node as HTMLElement;
  return {
    kind: 'element',
    tag: el.tagName,
    class: el.className || null,
    children: Array.from(el.childNodes).map(describeNode),
  };
}

function findLineDOM(view: EditorView, linePos: number): HTMLElement | null {
  const found = view.domAtPos(linePos);
  let node: Node | null = found.node;
  while (node && !(node instanceof HTMLElement && node.classList.contains('cm-line'))) {
    node = node.parentNode;
  }
  return node as HTMLElement | null;
}

function charCodesOf(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function logComparison(label: string, docLineText: string, domText: string) {
  const match = docLineText === domText;
  // eslint-disable-next-line no-console
  console.log(
    `[leadingIndentDebug] ${label} state.doc line=${JSON.stringify(docLineText)} DOM textContent=${JSON.stringify(
      domText
    )} MATCH=${match}`
  );
  if (!match) {
    const maxLen = Math.max(docLineText.length, domText.length);
    const diffIndexes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      if (docLineText[i] !== domText[i]) {
        diffIndexes.push(i);
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[leadingIndentDebug]   MISMATCH doc.length=${docLineText.length} dom.length=${domText.length} diffIndexes=${JSON.stringify(
        diffIndexes
      )} docCodes=${JSON.stringify(charCodesOf(docLineText))} domCodes=${JSON.stringify(charCodesOf(domText))}`
    );
  }
}

const updateLogger = EditorView.updateListener.of((update: ViewUpdate) => {
  if (!DEBUG_LEADING_INDENT) {
    return;
  }

  // TEMPORARY: expose the live view on window so it can be inspected
  // directly from the browser console during this investigation. Runs on
  // every update (not gated on docChanged) so it's available immediately
  // on page load, before any edit happens.
  (window as unknown as { __debugView?: EditorView }).__debugView = update.view;

  if (!update.docChanged) {
    return;
  }

  const id = ++updateCount;
  const view = update.view;
  const state = update.state;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);

  const userEventNames = update.transactions.map((tr) => tr.annotation(Transaction.userEvent) ?? null);

  // eslint-disable-next-line no-console
  console.log(
    `[leadingIndentDebug] === update #${id} === changes=${JSON.stringify(
      update.changes.toJSON()
    )} userEvents=${JSON.stringify(userEventNames)} selection.from=${state.selection.main.from} selection.to=${
      state.selection.main.to
    }`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[leadingIndentDebug] affected line #${line.number} [${line.from},${line.to}] text=${JSON.stringify(line.text)}`
  );

  // Decoration ranges, read from the actual live DecorationSet (not
  // recomputed) via the exported plugin instance.
  const pluginInstance = view.plugin(leadingIndentDecorationPlugin);
  const ranges: Array<[number, number, string]> = [];
  pluginInstance?.decorations.between(line.from, line.to, (from, to) => {
    ranges.push([from, to, state.doc.sliceString(from, to)]);
  });
  // eslint-disable-next-line no-console
  console.log(`[leadingIndentDebug] indent decorations: ${JSON.stringify(ranges)}`);

  // DOM structure for the affected line, logged after CM6 has finished
  // syncing the DOM for this update (updateListener fires post-sync).
  const lineDOM = findLineDOM(view, line.from);
  if (lineDOM) {
    // eslint-disable-next-line no-console
    console.log(
      `[leadingIndentDebug] DOM structure: ${JSON.stringify(
        Array.from(lineDOM.childNodes).map(describeNode),
        null,
        1
      )}`
    );
    logComparison(`update #${id}`, line.text, lineDOM.textContent ?? '');
  } else {
    // eslint-disable-next-line no-console
    console.log(`[leadingIndentDebug] could not locate .cm-line DOM for line #${line.number}`);
  }
});

interface MutationLoggerPlugin extends PluginValue {
  observer: MutationObserver | null;
  destroy(): void;
}

/**
 * Raw MutationObserver on the whole content DOM, to see native
 * `contenteditable` mutations as they land — including any transient
 * state the browser produces before CM6's own reconciliation runs, since
 * `updateListener` only ever sees the DOM *after* CM6 has finished
 * syncing it for a given update.
 */
function mutationLogger(): Extension {
  return ViewPlugin.fromClass<MutationLoggerPlugin>(
    class implements MutationLoggerPlugin {
      observer: MutationObserver | null = null;

      constructor(view: EditorView) {
        if (!DEBUG_LEADING_INDENT) {
          return;
        }
        this.observer = new MutationObserver((records) => {
          for (const record of records) {
            const target = record.target as HTMLElement;
            const targetLine = target.closest?.('.cm-line') ?? (target.parentElement?.closest?.('.cm-line') ?? null);
            // eslint-disable-next-line no-console
            console.log(
              `[leadingIndentDebug] MUTATION type=${record.type} target=${
                target.nodeType === Node.TEXT_NODE ? `TEXT ${JSON.stringify(target.textContent)}` : (target as HTMLElement).tagName
              } addedNodes=${JSON.stringify(Array.from(record.addedNodes).map(describeNode))} removedNodes=${JSON.stringify(
                Array.from(record.removedNodes).map(describeNode)
              )} oldValue=${JSON.stringify(record.oldValue)}`
            );
            if (targetLine) {
              // eslint-disable-next-line no-console
              console.log(
                `[leadingIndentDebug]   affected .cm-line now: ${JSON.stringify(
                  Array.from(targetLine.childNodes).map(describeNode)
                )}`
              );
            }
          }
        });
        this.observer.observe(view.contentDOM, {
          childList: true,
          subtree: true,
          characterData: true,
          characterDataOldValue: true,
        });
      }

      destroy() {
        this.observer?.disconnect();
        this.observer = null;
      }
    }
  );
}

export function leadingIndentDecorationDebug(): Extension {
  return [updateLogger, mutationLogger()];
}
