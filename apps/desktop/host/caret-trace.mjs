// Opt-in development instrumentation injected by the existing host bootstrap.
// No editor policy, note content, credentials, network, storage or native bridge.
export function installCaretTrace() {
  if (globalThis.__clutterCaretDiagnostics) return;
  let active = false,
    startTime = 0,
    timer = null,
    rows = [],
    dropped = 0,
    restores = [],
    lastSnapshot = null,
    instrumented = [];
  const limit = 400;
  const nodeKind = (node) =>
    node?.nodeType === 3
      ? 'text'
      : node?.nodeType === 1
        ? node.tagName.toLowerCase()
        : 'none';
  const editorFor = (node) =>
    (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(
      '.ProseMirror'
    ) ?? null;
  function snapshot() {
    const sel = document.getSelection(),
      editor = editorFor(document.activeElement) || editorFor(sel?.anchorNode);
    let caret = 'unknown';
    try {
      if (editor)
        caret = String(getComputedStyle(editor).caretColor).slice(0, 80);
    } catch {}
    return {
      active: editorFor(document.activeElement)
        ? 'editor'
        : document.activeElement?.closest?.('[role=toolbar]')
          ? 'toolbar'
          : 'other',
      focused: document.hasFocus(),
      blockMode: !!editor?.hasAttribute('data-body-selection'),
      hidden: !!editor?.classList.contains('ProseMirror-hideselection'),
      caret,
      anchor: nodeKind(sel?.anchorNode),
      anchorOffset: sel?.anchorOffset ?? null,
      head: nodeKind(sel?.focusNode),
      headOffset: sel?.focusOffset ?? null,
      collapsed: sel?.isCollapsed ?? null,
    };
  }
  function append(event, extra = {}) {
    const state = snapshot(),
      changed = {};
    for (const [name, value] of Object.entries(state))
      if (!lastSnapshot || lastSnapshot[name] !== value) changed[name] = value;
    lastSnapshot = state;
    rows.push({
      ms: Math.round((performance.now() - startTime) * 10) / 10,
      event,
      ...extra,
      ...changed,
    });
  }
  function record(event, extra = {}) {
    if (!active) return;
    if (rows.length >= limit) {
      dropped++;
      stop();
      return;
    }
    append(event, extra);
  }
  const report = () => ({
    format: 'clutter-caret-trace73',
    durationMs: rows.at(-1)?.ms ?? 0,
    events: rows.length,
    dropped,
    content:
      'no note text, URLs, page IDs, credentials or keyboard characters captured',
    stateFields: 'unchanged state fields omitted after first row',
    instrumented: [...instrumented],
    rows: [...rows],
  });
  function wrap(proto, name, category) {
    if (!proto) return;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (
      !descriptor ||
      typeof descriptor.value !== 'function' ||
      !descriptor.configurable
    )
      return;
    const original = descriptor.value;
    const wrapped = function (...args) {
      const relevant = category === 'selection' || !!editorFor(this);
      if (relevant) record(category + '.' + name + '.before');
      const result = Reflect.apply(original, this, args);
      if (relevant) record(category + '.' + name + '.after');
      return result;
    };
    try {
      Object.defineProperty(proto, name, { ...descriptor, value: wrapped });
      instrumented.push(category + '.' + name);
      restores.push(() => {
        if (Object.getOwnPropertyDescriptor(proto, name)?.value === wrapped)
          Object.defineProperty(proto, name, descriptor);
      });
    } catch {}
  }
  const event = (event) => {
    const extra = {};
    if (event.type === 'keydown')
      extra.key =
        (event.metaKey || event.ctrlKey) &&
        ['a', 'z'].includes(event.key.toLowerCase())
          ? event.key.toLowerCase()
          : ['Backspace', 'Delete', 'Escape', 'Enter', 'Tab'].includes(
                event.key
              )
            ? event.key
            : 'character';
    if (event.type === 'keydown') {
      extra.meta = event.metaKey;
      extra.ctrl = event.ctrlKey;
    }
    record('dom.' + event.type, extra);
  };
  const events = [
    'pointerdown',
    'mousedown',
    'mouseup',
    'click',
    'focusin',
    'focusout',
    'selectionchange',
    'keydown',
  ];
  const windowEvent = (event) => {
    if (event.target === globalThis) record('window.' + event.type);
  };
  let observer = null,
    panel = null,
    output = null,
    status = null,
    startButton = null,
    stopButton = null;
  function stop() {
    if (!active) return report();
    if (rows.length < limit) append('capture.stop');
    active = false;
    clearTimeout(timer);
    timer = null;
    for (const restore of restores.reverse()) restore();
    restores = [];
    for (const name of events) document.removeEventListener(name, event, true);
    removeEventListener('focus', windowEvent, true);
    removeEventListener('blur', windowEvent, true);
    observer?.disconnect();
    observer = null;
    if (output) output.value = JSON.stringify(report());
    if (status)
      status.textContent = 'Capture complete. Copy trace and share it.';
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    return report();
  }
  function start() {
    if (active) stop();
    rows = [];
    lastSnapshot = null;
    instrumented = [];
    dropped = 0;
    startTime = performance.now();
    active = true;
    for (const name of [
      'setBaseAndExtent',
      'removeAllRanges',
      'addRange',
      'collapse',
      'extend',
      'selectAllChildren',
      'setPosition',
      'empty',
      'collapseToStart',
      'collapseToEnd',
    ])
      wrap(globalThis.Selection?.prototype, name, 'selection');
    for (const name of ['focus', 'blur'])
      wrap(globalThis.HTMLElement?.prototype, name, 'element');
    for (const name of events) document.addEventListener(name, event, true);
    addEventListener('focus', windowEvent, true);
    addEventListener('blur', windowEvent, true);
    observer = new MutationObserver((records) => {
      for (const mutation of records)
        if (
          mutation.target instanceof Element &&
          mutation.target.matches('.ProseMirror')
        )
          record('editor.attribute', { attribute: mutation.attributeName });
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-body-selection', 'contenteditable'],
    });
    record('capture.start');
    timer = setTimeout(stop, 12000);
    if (status)
      status.textContent =
        'Recording 12 seconds: select body blocks, Delete, then click once and watch the caret.';
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;
  }
  function mount() {
    panel = document.createElement('details');
    panel.setAttribute('data-caret-diagnostics', '');
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '8px',
      right: '8px',
      zIndex: '10000',
      maxWidth: '440px',
      padding: '8px',
      background: '#fff',
      color: '#24343e',
      border: '1px solid #9bafbe',
      borderRadius: '6px',
      font: '13px system-ui',
    });
    const summary = document.createElement('summary');
    summary.textContent = 'Caret trace (development)';
    panel.append(summary);
    const button = (label, action) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', action);
      panel.append(b);
      return b;
    };
    startButton = button('Start 12-second trace', start);
    stopButton = button('Stop trace', stop);
    stopButton.disabled = true;
    button('Copy trace', async () => {
      if (active) stop();
      const value = JSON.stringify(report());
      try {
        if (!navigator.clipboard?.writeText) throw Error('manual');
        await navigator.clipboard.writeText(value);
        status.textContent = 'Copied. Paste the trace into the chat.';
      } catch {
        output.focus();
        output.select();
        status.textContent =
          'Press Cmd+C to copy the selected trace, then paste it into the chat.';
      }
    });
    status = document.createElement('p');
    status.textContent =
      'Opt-in metadata only; no note text. Start, reproduce once, then copy trace.';
    panel.append(status);
    output = document.createElement('textarea');
    output.readOnly = true;
    output.setAttribute('aria-label', 'Caret trace JSON');
    output.style.width = '100%';
    output.rows = 3;
    panel.append(output);
    document.body.append(panel);
  }
  Object.defineProperty(globalThis, '__clutterCaretDiagnostics', {
    value: Object.freeze({ start, stop, report }),
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
export const caretTraceSource = () => `(${installCaretTrace.toString()})();`;
