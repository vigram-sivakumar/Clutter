import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SurfaceRegistry } from '../../ui/src/surfaces.mjs';
import { WindowNavigation } from '../../ui/src/navigation.mjs';

test('surface leases bound detached DOM without discarding retained contexts; active/preparing views cannot be evicted', async () => {
  const dom = new JSDOM(
    '<main class="page-area"><div class="note-scroll"><div id="slot"></div></div></main>'
  );
  const contexts = new Map(),
    destroyed = [];
  const workspaces = new Map();
  const model = {
    editor(pageId) {
      if (!workspaces.has(pageId))
        workspaces.set(pageId, {
          viewports: new Map(),
          captureView() {},
          restoreView() {},
          async mount(key, host) {
            contexts.set(pageId, { retained: true });
            const node = dom.window.document.createElement('div');
            node.textContent = pageId;
            host.append(node);
            return { dom: node };
          },
          unmount(key) {
            destroyed.push([pageId, key]);
          },
        });
      return workspaces.get(pageId);
    },
  };
  const registry = new SurfaceRegistry(model, dom.window.document, {
    cacheLimit: 1,
  });
  let id = 0;
  const nav = new WindowNavigation(() => 'id_' + ++id);
  const target = dom.window.document.querySelector('#slot');
  try {
    nav.open('a');
    let release = await registry.prepare(nav);
    const key = nav.viewKey(nav.activeTab, nav.activePane);
    const first = registry.attach('a', key, target);
    release();
    nav.open('b');
    release = await registry.prepare(nav);
    registry.detach('a', key);
    registry.attach('b', key, target);
    release();
    nav.open('c');
    release = await registry.prepare(nav);
    registry.trim();
    assert.equal(destroyed.length, 0, 'preparing and active views protected');
    registry.detach('b', key);
    registry.attach('c', key, target);
    release();
    await new Promise((ok) => setTimeout(ok, 10));
    assert.deepEqual(destroyed, [['a', key]]);
    assert.equal(
      registry.entries.size,
      2,
      'one active plus one detached cached surface'
    );
    assert.equal(contexts.size, 3, 'eviction never destroys document contexts');
    const again = await registry.prepare(nav);
    assert.equal(registry.attach('c', key, target).dom.textContent, 'c');
    again();
    assert.equal(first.dom.textContent, 'a');
  } finally {
    registry.destroy();
    dom.window.close();
  }
});
