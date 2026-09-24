/**
 * TEMPORARY DIAGNOSTIC INSTRUMENTATION.
 *
 * Added to investigate a reported symptom: during continuous native
 * window resize, the native window boundary moves immediately but the
 * page's own content visually lags behind and only catches up once
 * resizing stops. Dev-only (installResizeDiagnostics() no-ops unless
 * import.meta.env.DEV, and main.tsx only calls it there) — never runs
 * in a production build.
 *
 * DELETE THIS FILE and its call site in main.tsx once the investigation
 * is done. Nothing here should ever ship.
 *
 * Usage (from the DevTools console, in the window you're testing):
 *   window.__resizeDiag.reset()   // clears counters, start here
 *   ... drag-resize the window for a few seconds ...
 *   window.__resizeDiag.report()  // logs + returns a summary object,
 *                                    including geometry during the
 *                                    largest resize-event gap
 *
 * To isolate CodeMirror's ResizeObserver specifically (Test 3), without
 * touching any production file:
 *   window.__resizeDiag.disconnectAllResizeObservers()
 *   ... repeat the drag-resize test ...
 *   window.__resizeDiag.report()
 * (Reload the page afterward to restore normal behavior.)
 */

interface GeometrySample {
  t: number;
  innerWidth: number;
  clientWidth: number;
  appLayoutW: number | null;
  pageW: number | null;
  cmScrollerW: number | null;
}

interface DiagState {
  resizeEvents: number;
  lastResizeAt: number;
  resizeGapsMs: number[];
  resizeEventTimes: number[];
  rafCalls: number;
  rafTotalMs: number;
  rafMaxMs: number;
  roCallbacks: number;
  roTotalMs: number;
  roMaxMs: number;
  roTargets: Map<string, number>;
  layoutReads: Map<string, number>;
  domMutations: number;
  longTasks: Array<{ start: number; duration: number }>;
  geometrySamples: GeometrySample[];
}

const MAX_GEOMETRY_SAMPLES = 20000;

/**
 * Installs all resize-diagnostic instrumentation. Must be called
 * synchronously, before anything else mounts (main.tsx calls this before
 * createRoot().render()) — an async install would let CodeMirror capture
 * a reference to the original, unpatched `window.ResizeObserver` before
 * this had a chance to wrap it, silently missing the thing being
 * measured. No-ops entirely outside dev builds.
 */
export function installResizeDiagnostics(): void {
  if (!import.meta.env.DEV) return;

  const state: DiagState = {
    resizeEvents: 0,
    lastResizeAt: 0,
    resizeGapsMs: [],
    resizeEventTimes: [],
    rafCalls: 0,
    rafTotalMs: 0,
    rafMaxMs: 0,
    roCallbacks: 0,
    roTotalMs: 0,
    roMaxMs: 0,
    roTargets: new Map(),
    layoutReads: new Map(),
    domMutations: 0,
    longTasks: [],
    geometrySamples: [],
  };

  const liveResizeObservers: ResizeObserver[] = [];

  function describeTarget(el: unknown): string {
    if (!(el instanceof Element)) return String(el);
    const cls = typeof el.className === 'string' ? el.className : '';
    const classPart = cls
      ? '.' +
        cls
          .split(' ')
          .filter(Boolean)
          .join('.')
      : '';
    return `${el.tagName.toLowerCase()}${classPart}`;
  }

  function bump(map: Map<string, number>, key: string, by = 1): void {
    map.set(key, (map.get(key) ?? 0) + by);
  }

  // 1. Native resize events — frequency and gaps between them.
  window.addEventListener('resize', () => {
    const now = performance.now();
    if (state.lastResizeAt) state.resizeGapsMs.push(now - state.lastResizeAt);
    state.lastResizeAt = now;
    state.resizeEvents++;
    state.resizeEventTimes.push(now);
  });

  // 2. ResizeObserver — wrap the constructor so every observer's callback
  // (CodeMirror's internal ones included, and any of ours) is timed and
  // attributed to its target element. Instances are kept in
  // liveResizeObservers so Test 3 can disconnect them all on demand,
  // without needing a handle into CodeMirror's own internals.
  const NativeResizeObserver = window.ResizeObserver;
  if (NativeResizeObserver) {
    class InstrumentedResizeObserver extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          const start = performance.now();
          callback(entries, observer);
          const duration = performance.now() - start;
          state.roCallbacks++;
          state.roTotalMs += duration;
          if (duration > state.roMaxMs) state.roMaxMs = duration;
          for (const entry of entries) {
            bump(state.roTargets, describeTarget(entry.target));
          }
        });
        liveResizeObservers.push(this);
      }
    }
    window.ResizeObserver = InstrumentedResizeObserver as unknown as typeof ResizeObserver;
  }

  // 3. requestAnimationFrame — call volume and per-callback duration.
  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    return nativeRaf((t) => {
      const start = performance.now();
      cb(t);
      const duration = performance.now() - start;
      state.rafCalls++;
      state.rafTotalMs += duration;
      if (duration > state.rafMaxMs) state.rafMaxMs = duration;
    });
  };

  // 4. Expensive layout reads — just counts, kept deliberately cheap
  // (no logging per call) so the instrumentation itself doesn't skew the
  // very thing it's measuring.
  function instrumentLayoutRead(proto: object, prop: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
    if (!descriptor || !descriptor.get) return;
    const originalGet = descriptor.get;
    Object.defineProperty(proto, prop, {
      ...descriptor,
      get(this: Element) {
        bump(state.layoutReads, prop);
        return originalGet.call(this);
      },
    });
  }

  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    bump(state.layoutReads, 'getBoundingClientRect');
    return originalGetBoundingClientRect.call(this);
  };
  for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight']) {
    instrumentLayoutRead(Element.prototype, prop);
    instrumentLayoutRead(HTMLElement.prototype, prop);
  }

  // 5. DOM mutation volume inside .app-layout, as a proxy for React
  // render/commit activity there — avoids touching AppLayout.tsx directly.
  function observeAppLayout(): void {
    const target = document.querySelector('.app-layout');
    if (!target) {
      nativeRaf(observeAppLayout);
      return;
    }
    const mo = new MutationObserver((mutations) => {
      state.domMutations += mutations.length;
    });
    mo.observe(target, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  observeAppLayout();

  // 6. Long tasks (main-thread blocks >50ms) — one signal (not the only
  // one — WebKit's Long Tasks support is less complete than Chromium's)
  // for "is the main thread backlogged during the resize".
  if ('PerformanceObserver' in window) {
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch {
      // 'longtask' entry type unsupported in this browser — skip silently.
    }
  }

  // 7. Continuous geometry sampler, driven by the ORIGINAL (uninstrumented)
  // rAF, independent of the 'resize' event entirely. This is what actually
  // answers the Case A vs. Case B question: does viewport/app-layout/page
  // geometry keep updating every frame throughout the drag (even during a
  // gap with no dispatched 'resize' event), or does it also freeze? Uses
  // original getters directly (bypassing the wrapped ones above) so this
  // sampler doesn't inflate the layout-read counters it's meant to help
  // interpret.
  function readWidth(selector: string): number | null {
    const el = document.querySelector(selector);
    if (!el) return null;
    return Math.round(originalGetBoundingClientRect.call(el).width);
  }
  function sampleGeometryLoop(): void {
    if (state.geometrySamples.length < MAX_GEOMETRY_SAMPLES) {
      state.geometrySamples.push({
        t: performance.now(),
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        appLayoutW: readWidth('.app-layout'),
        pageW: readWidth('.app-layout__page'),
        cmScrollerW: readWidth('.cm-scroller'),
      });
    }
    nativeRaf(sampleGeometryLoop);
  }
  nativeRaf(sampleGeometryLoop);

  function summary() {
    const gaps = state.resizeGapsMs;
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const maxGap = gaps.length ? Math.max(...gaps) : 0;

    // Find the window in time of the single largest resize-event gap, and
    // pull every geometry sample that falls inside it — this is the direct
    // answer to "what happens during the gap".
    let gapWindow: { startT: number; endT: number } | null = null;
    if (gaps.length && state.resizeEventTimes.length >= 2) {
      const maxGapIndex = gaps.indexOf(maxGap);
      // resizeGapsMs[i] is the gap between resizeEventTimes[i] and
      // resizeEventTimes[i+1] (gaps.length === resizeEventTimes.length - 1).
      const startT = state.resizeEventTimes[maxGapIndex];
      const endT = state.resizeEventTimes[maxGapIndex + 1];
      if (startT !== undefined && endT !== undefined) {
        gapWindow = { startT, endT };
      }
    }
    const gw = gapWindow;
    const samplesDuringLargestGap = gw
      ? state.geometrySamples.filter((s) => s.t >= gw.startT && s.t <= gw.endT)
      : [];

    return {
      resizeEvents: state.resizeEvents,
      avgResizeEventGapMs: Math.round(avgGap * 10) / 10,
      maxResizeEventGapMs: Math.round(maxGap),
      rafCalls: state.rafCalls,
      rafAvgMs: state.rafCalls ? Math.round((state.rafTotalMs / state.rafCalls) * 100) / 100 : 0,
      rafMaxMs: Math.round(state.rafMaxMs * 100) / 100,
      resizeObserverCallbacks: state.roCallbacks,
      resizeObserverAvgMs: state.roCallbacks
        ? Math.round((state.roTotalMs / state.roCallbacks) * 100) / 100
        : 0,
      resizeObserverMaxMs: Math.round(state.roMaxMs * 100) / 100,
      resizeObserverTargets: Object.fromEntries(state.roTargets),
      layoutReadCounts: Object.fromEntries(state.layoutReads),
      domMutationsInAppLayout: state.domMutations,
      longTaskCount: state.longTasks.length,
      longTaskTotalMs: Math.round(state.longTasks.reduce((a, t) => a + t.duration, 0)),
      longTaskMaxMs: state.longTasks.length
        ? Math.round(Math.max(...state.longTasks.map((t) => t.duration)))
        : 0,
      liveResizeObserverCount: liveResizeObservers.length,
      totalGeometrySamples: state.geometrySamples.length,
      largestGapDurationMs: gapWindow ? Math.round(gapWindow.endT - gapWindow.startT) : 0,
      samplesDuringLargestGap: samplesDuringLargestGap.length,
      // The actual answer to Case A vs Case B: geometry readings taken
      // (via rAF, independent of 'resize') AT THE START and END of the
      // largest gap. If innerWidth/appLayoutW/pageW differ between them,
      // layout kept updating live during the gap (Case B — only paint/
      // content lagged). If they're identical despite the window visibly
      // having moved, layout itself was frozen (Case A).
      geometryAtGapStart: samplesDuringLargestGap[0] ?? null,
      geometryAtGapEnd: samplesDuringLargestGap[samplesDuringLargestGap.length - 1] ?? null,
    };
  }

  (
    window as unknown as {
      __resizeDiag: {
        reset(): void;
        report(): unknown;
        disconnectAllResizeObservers(): void;
      };
    }
  ).__resizeDiag = {
    reset() {
      state.resizeEvents = 0;
      state.lastResizeAt = 0;
      state.resizeGapsMs.length = 0;
      state.resizeEventTimes.length = 0;
      state.rafCalls = 0;
      state.rafTotalMs = 0;
      state.rafMaxMs = 0;
      state.roCallbacks = 0;
      state.roTotalMs = 0;
      state.roMaxMs = 0;
      state.roTargets.clear();
      state.layoutReads.clear();
      state.domMutations = 0;
      state.longTasks.length = 0;
      state.geometrySamples.length = 0;
      console.log(
        '[resizeDiag] reset. Now drag-resize the window for a few seconds, then run window.__resizeDiag.report()'
      );
    },
    report() {
      const s = summary();
      console.log('[resizeDiag] summary:', s);
      return s;
    },
    disconnectAllResizeObservers() {
      for (const ro of liveResizeObservers) {
        ro.disconnect();
      }
      console.log(
        `[resizeDiag] disconnected ${liveResizeObservers.length} ResizeObserver instance(s) (includes CodeMirror's, if it had created one by now). Reload the page to restore normal behavior.`
      );
    },
  };

  console.log(
    '[resizeDiag] instrumentation active. Run window.__resizeDiag.reset(), drag-resize, then window.__resizeDiag.report().'
  );
}
