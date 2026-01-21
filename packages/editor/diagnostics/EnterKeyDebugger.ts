/**
 * 🔍 ENTER KEY DIAGNOSTIC PATCH
 *
 * Uses native DOM event listeners to capture EVERY function call
 * when Enter key is pressed - without breaking ProseMirror's internal state.
 *
 * Usage: Import and call `enableEnterKeyDiagnostics(editor)` after editor creation
 */

import { Editor } from '@tiptap/core';
import { Transaction } from '@tiptap/pm/state';

let diagnosticActive = false;
let enterKeyPressed = false;
let transactionCount = 0;
let eventLog: Array<{
  timestamp: number;
  type: string;
  source: string;
  details: any;
}> = [];

// Cleanup tracking
let cleanupFunctions: Array<() => void> = [];
let currentEditor: Editor | null = null;

function log(type: string, source: string, details: any = {}) {
  const entry = {
    timestamp: performance.now(),
    type,
    source,
    details,
  };
  eventLog.push(entry);

  const emoji =
    type === 'keydown'
      ? '⌨️'
      : type === 'transaction'
        ? '📝'
        : type === 'appendTransaction'
          ? '🔄'
          : type === 'event'
            ? '📡'
            : type === 'selection'
              ? '👆'
              : type === 'react'
                ? '⚛️'
                : '🔵';

  console.log(`${emoji} [${type.toUpperCase()}] ${source}`, details);
}

export function enableEnterKeyDiagnostics(editor: Editor) {
  const view = editor.view;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GUARD: Prevent double initialization
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Check if already installed on this specific view
  if ((view as any).__enterDiagnosticInstalled) {
    console.warn(
      '⚠️ Enter key diagnostics already enabled on this editor instance'
    );
    return;
  }

  // Check global flag (shouldn't happen, but safety net)
  if (diagnosticActive && currentEditor === editor) {
    console.warn('⚠️ Enter key diagnostics already active globally');
    return;
  }

  // Clean up any previous installation
  if (diagnosticActive && currentEditor !== editor) {
    console.log('🔄 Cleaning up previous diagnostic installation...');
    disableEnterKeyDiagnostics();
  }

  diagnosticActive = true;
  currentEditor = editor;
  (view as any).__enterDiagnosticInstalled = true;

  console.log('🔍 ENTER KEY DIAGNOSTICS ENABLED');
  console.log('Press Enter to see complete execution trace...\n');

  const originalDispatch = view.dispatch.bind(view);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. INTERCEPT KEYDOWN EVENTS (Native DOM Listener - Safe!)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      enterKeyPressed = true;
      transactionCount = 0;
      eventLog = [];

      console.clear();
      console.log('═══════════════════════════════════════════════════');
      console.log('🎯 ENTER KEY PRESSED - STARTING CAPTURE');
      console.log('═══════════════════════════════════════════════════\n');

      log('keydown', 'Browser Event', {
        key: event.key,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        cursorPos: view.state.selection.$from.pos,
        selectionEmpty: view.state.selection.empty,
      });

      // Schedule trace summary after all processing
      setTimeout(() => {
        printTraceSummary();
        enterKeyPressed = false;
      }, 100);
    }
  };

  // Add listener in CAPTURE phase (before ProseMirror handles it)
  view.dom.addEventListener('keydown', handleKeyDown, true);

  // Track cleanup
  cleanupFunctions.push(() => {
    view.dom.removeEventListener('keydown', handleKeyDown, true);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. INTERCEPT ALL TRANSACTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const patchedDispatch = function (tr: Transaction) {
    if (enterKeyPressed) {
      transactionCount++;

      const meta = tr.getMeta('origin') || tr.getMeta('source') || 'unknown';
      const hasSteps = tr.steps.length > 0;
      const docChanged = tr.docChanged;
      const selectionSet = tr.selectionSet;

      log('transaction', `Transaction #${transactionCount}`, {
        origin: meta,
        steps: tr.steps.length,
        docChanged,
        selectionSet,
        selection: {
          type: tr.selection?.constructor?.name,
          from: tr.selection?.$from.pos,
          to: tr.selection?.$to.pos,
          empty: tr.selection?.empty,
        },
        // Show what changed
        ...(hasSteps && {
          changes: tr.steps.map((step: any) => ({
            type: step.constructor.name,
            from: step.from,
            to: step.to,
          })),
        }),
      });

      // Check for invariant violations
      if (docChanged && !selectionSet) {
        console.error(
          '❌ INVARIANT VIOLATION: docChanged without selectionSet!'
        );
      }
    }

    return originalDispatch(tr);
  };

  view.dispatch = patchedDispatch;

  // Track cleanup
  cleanupFunctions.push(() => {
    view.dispatch = originalDispatch;
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. INTERCEPT EDITOR EVENTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const originalOn = editor.on.bind(editor);
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => unknown>>();

  editor.on = function (
    event: string,
    callback: (...args: unknown[]) => unknown
  ) {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set());

      // Wrap all handlers for this event
      const originalEmit = (editor as any).emit.bind(editor);

      (editor as any).emit = function (eventName: string, ...args: any[]) {
        if (enterKeyPressed && eventName === event) {
          log('event', `editor.emit('${eventName}')`, {
            args: args.length,
            handlers: eventHandlers.get(eventName)?.size || 0,
          });
        }
        return originalEmit(eventName, ...args);
      };
    }

    eventHandlers.get(event)!.add(callback);
    return originalOn(event, callback);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. INTERCEPT APPENDTRANSACTION HOOKS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const plugins = view.state.plugins;
  plugins.forEach((plugin: any, index: number) => {
    if (plugin.spec?.appendTransaction) {
      const originalAppendTr = plugin.spec.appendTransaction;
      const pluginName = plugin.key || `Plugin #${index}`;

      plugin.spec.appendTransaction = function (
        transactions: readonly Transaction[],
        oldState: any,
        newState: any
      ) {
        const result = originalAppendTr.call(
          this,
          transactions,
          oldState,
          newState
        );

        if (enterKeyPressed && result) {
          log('appendTransaction', `${pluginName}`, {
            returned: !!result,
            docChanged: result.docChanged,
            selectionSet: result.selectionSet,
            steps: result.steps?.length || 0,
            selection: {
              type: result.selection?.constructor?.name,
              from: result.selection?.$from.pos,
              to: result.selection?.$to.pos,
            },
          });

          // Check for issues
          if (result.docChanged && !result.selectionSet) {
            console.error(
              `❌ ${pluginName} returned docChanged without selectionSet!`
            );
          }
        }

        return result;
      };
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. INTERCEPT SELECTION CHANGES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  editor.on('selectionUpdate', ({ editor }: any) => {
    if (enterKeyPressed) {
      log('selection', 'selectionUpdate event', {
        type: editor.state.selection?.constructor?.name,
        from: editor.state.selection?.$from.pos,
        to: editor.state.selection?.$to.pos,
        empty: editor.state.selection?.empty,
        // Get the actual node at cursor
        node: editor.state.selection?.$from.parent?.type?.name,
      });
    }
  });

  console.log('✅ Diagnostics installed successfully!\n');
}

function printTraceSummary() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 EXECUTION TRACE SUMMARY');
  console.log('═══════════════════════════════════════════════════\n');

  console.log(`Total events captured: ${eventLog.length}`);
  console.log(`Total transactions: ${transactionCount}\n`);

  // Group by type
  const byType = eventLog.reduce(
    (acc, entry) => {
      acc[entry.type] = (acc[entry.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log('Events by type:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log('\n📝 Transaction sequence:');
  const transactions = eventLog.filter((e) => e.type === 'transaction');
  transactions.forEach((tr, i) => {
    const details = tr.details;
    const warning =
      details.docChanged && !details.selectionSet ? ' ❌ INVALID' : '';
    console.log(
      `  ${i + 1}. ${tr.source}${warning}`,
      `(steps: ${details.steps}, selection: ${details.selection?.from})${warning}`
    );
  });

  console.log('\n🔄 appendTransaction hooks:');
  const appendTrs = eventLog.filter((e) => e.type === 'appendTransaction');
  if (appendTrs.length === 0) {
    console.log('  (none fired)');
  } else {
    appendTrs.forEach((tr) => {
      const details = tr.details;
      const warning =
        details.docChanged && !details.selectionSet ? ' ❌ INVALID' : '';
      console.log(`  - ${tr.source}${warning}`);
    });
  }

  console.log('\n📡 Editor events fired:');
  const events = eventLog.filter((e) => e.type === 'event');
  if (events.length === 0) {
    console.log('  (none)');
  } else {
    events.forEach((ev) => {
      console.log(`  - ${ev.source}`);
    });
  }

  console.log('\n👆 Final selection state:');
  const lastSelection = eventLog.filter((e) => e.type === 'selection').pop();
  if (lastSelection) {
    console.log(`  Type: ${lastSelection.details.type}`);
    console.log(`  Position: ${lastSelection.details.from}`);
    console.log(`  Node: ${lastSelection.details.node}`);
  } else {
    console.log('  (no selection update captured)');
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('Full event log available in `eventLog` variable');
  console.log('═══════════════════════════════════════════════════\n');

  // Make available in console
  (window as any).__enterKeyEventLog = eventLog;
  console.log('💡 Tip: Access full log with `__enterKeyEventLog`');
}

export function disableEnterKeyDiagnostics() {
  if (!diagnosticActive) {
    console.warn('⚠️ Enter key diagnostics not active');
    return;
  }

  console.log('🔄 Disabling enter key diagnostics...');

  // Run all cleanup functions
  cleanupFunctions.forEach((cleanup) => {
    try {
      cleanup();
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  });

  // Clear state
  cleanupFunctions = [];
  diagnosticActive = false;
  enterKeyPressed = false;
  transactionCount = 0;
  eventLog = [];

  // Clear view marker
  if (currentEditor?.view) {
    delete (currentEditor.view as any).__enterDiagnosticInstalled;
  }
  currentEditor = null;

  console.log('✅ Enter key diagnostics disabled and cleaned up');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HMR Support - Clean up on hot reload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (diagnosticActive) {
      console.log('🔥 HMR: Cleaning up diagnostics before hot reload');
      disableEnterKeyDiagnostics();
    }
  });
}
