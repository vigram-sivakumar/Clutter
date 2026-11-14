(() => {
  const events = [];
  const namedKeys = new Set([
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Tab',
    'Enter',
    'Backspace',
    'Delete',
    'Escape',
    'Home',
    'End',
    'Shift',
    'Meta',
    'Control',
    'Alt',
    'CapsLock',
    'Process',
    'Dead',
    'Unidentified',
  ]);
  for (const type of [
    'keydown',
    'beforeinput',
    'input',
    'compositionstart',
    'compositionupdate',
    'compositionend',
    'focusin',
    'focusout',
  ]) {
    document.addEventListener(
      type,
      (event) => {
        const selection = window.getSelection();
        events.push({
          type,
          time: Math.round(performance.now()),
          key: event.key
            ? namedKeys.has(event.key)
              ? event.key
              : '[text]'
            : null,
          inputType: event.inputType ?? null,
          isComposing: event.isComposing ?? null,
          target:
            event.target?.getAttribute?.('aria-label') ??
            event.target?.tagName ??
            null,
          anchorOffset: selection?.anchorOffset ?? null,
          headOffset: selection?.focusOffset ?? null,
        });
        if (events.length > 256) events.shift();
      },
      true
    );
  }
  const api = () => window.originLab ?? window.lab;
  const canonical = (value) =>
    JSON.stringify(value, (_, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, v[k]])
          )
        : v
    );
  window.r07Native = Object.freeze({
    capture() {
      let snapshot = null,
        error = null;
      try {
        snapshot = api()?.snapshot() ?? null;
      } catch (e) {
        error = String(e);
      }
      return {
        ready: !!api(),
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        url: location.pathname + location.search,
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        focus:
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.tagName,
        snapshot,
        error,
        events: [...events],
        candidateTrace: (window.lab?.trace?.() ?? window.controlTrace?.() ?? [])
          .slice(-256)
          .map(({ nativeText, ...event }) => ({
            ...event,
            key: event.key
              ? namedKeys.has(event.key)
                ? event.key
                : '[text]'
              : null,
          })),
      };
    },
    quick() {
      const results = [],
        lab = api();
      const check = (id, body) => {
        try {
          body();
          results.push({ id, status: 'pass' });
        } catch (e) {
          results.push({ id, status: 'fail', reason: String(e) });
        }
      };
      const assert = (ok, message) => {
        if (!ok) throw new Error(message);
      };
      if (!lab?.view || !lab?.reset)
        return {
          route: 'JavaScript fixture checks in WKWebView; not native input',
          results: [
            {
              id: 'QK-01',
              status: 'blocked',
              reason:
                'Candidate API not ready or raw control has no two-view API',
            },
          ],
        };
      lab.reset();
      try {
        check('QK-01', () =>
          assert(lab.view('A') && lab.view('B'), 'Missing editor view')
        );
        lab.select('A', 'Alpha');
        lab.select('B', 'Gamma', 2);
        const before = lab.snapshot();
        check('QK-02', () =>
          assert(
            before.contexts.A.anchor !== before.contexts.B.anchor,
            'Selections unexpectedly shared'
          )
        );
        const a = lab.view('A');
        a.dispatch(a.state.tr.insertText('WK-', 1));
        const after = lab.snapshot();
        check('QK-03', () =>
          assert(
            canonical(after.doc) === canonical(after.contexts.A.doc) &&
              canonical(after.doc) === canonical(after.contexts.B.doc),
            'Accepted document/views diverged'
          )
        );
        check('QK-04', () =>
          assert(
            after.contexts.B.anchor === before.contexts.B.anchor + 3 &&
              document.activeElement === lab.view('B').dom,
            'Background edit changed focus or mapped selection incorrectly'
          )
        );
      } finally {
        lab.reset();
      }
      return {
        route:
          'JavaScript fixture checks in WKWebView; not native keyboard, IME or menus',
        results,
      };
    },
  });
})();
