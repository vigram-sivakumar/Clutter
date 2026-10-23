import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Where the native window can be dragged from. jsdom does no layout, so these read the sources: they pin
 * the structure the drag regions rely on, and fail if a change would quietly take one away.
 */
const src = (path: string): string => readFileSync(join(__dirname, '../..', path), 'utf8');
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('window drag regions', () => {
  it('keeps the topbar, the sidebar controls and the sidebar toggle as drag regions', () => {
    expect(src('app/layouts/page/topbar/Page.TopBar.tsx')).toMatch(/className="topbar window-chrome" data-tauri-drag-region/);
    expect(src('app/layouts/sidebar/controls/Controls.tsx')).toMatch(/className="controls window-chrome" data-tauri-drag-region/);
    expect(src('app/layouts/app-layout/sidebar-toggle/SidebarToggle.tsx')).toMatch(
      /className="sidebar-toggle window-chrome" data-tauri-drag-region/
    );
  });

  it('mounts the shared strip in the sidepanel and at the top of the page area, before the page', () => {
    const layout = src('app/layouts/app-layout/AppLayout.tsx');
    const sidepanel = layout.slice(layout.indexOf('<aside className="app-layout__sidepanel">'));
    expect(sidepanel.indexOf('<TauriDragStrip />')).toBeGreaterThan(-1);
    expect(sidepanel.indexOf('<TauriDragStrip />')).toBeLessThan(sidepanel.indexOf('<Sidebar'));

    const page = layout.slice(layout.indexOf('<main className="app-layout__page">'));
    expect(page.indexOf('<TauriDragStrip />')).toBeGreaterThan(-1);
    expect(page.indexOf('<TauriDragStrip />')).toBeLessThan(page.indexOf('<PageHost'));
  });

  it('has one height for every strip: a shared token, not a literal in each place', () => {
    const tokens = stripComments(src('design-system/tokens.css'));
    expect(tokens).toMatch(/--tauri-drag-strip-height:\s*var\(--space-48\);/);
    expect(tokens).toMatch(/--space-48:\s*48px;/);

    const stripCss = stripComments(src('components/tauri-drag-strip/TauriDragStrip.css'));
    expect(stripCss).toMatch(/height: var\(--tauri-drag-strip-height\);/);
    expect(stripCss).toMatch(/top: 0px;/);
    // No z-index: it must never sit above the cover, the document or any control.
    expect(stripCss).not.toMatch(/z-index/);

    // Nothing else sizes a strip: the sidebar, the page area and the Welcome backdrop all use the primitive.
    for (const file of ['components/overlay/Overlay.css', 'components/dialog/Dialog.css', 'app/StartupFrame.css']) {
      expect(stripComments(src(file))).not.toMatch(/tauri-drag-strip/);
    }
    expect(src('components/overlay/Overlay.tsx')).toMatch(/<TauriDragStrip \/>/);
  });

  it('is an absolute overlay that takes no layout space, so nothing is pushed down to make room for it', () => {
    const stripCss = stripComments(src('components/tauri-drag-strip/TauriDragStrip.css'));
    const block = stripCss.slice(stripCss.indexOf('.tauri-drag-strip {'), stripCss.indexOf('}'));
    expect(block).toMatch(/position: absolute;/);
    expect(block).toMatch(/height: var\(--tauri-drag-strip-height\);/);
    expect(block).not.toMatch(/margin|padding|float|position: (?:static|relative|sticky)/);

    // No reservation for it anywhere in the page area: the page keeps its own inset and the cover its own
    // box (nothing reads the strip's height to offset content).
    const layoutCss = stripComments(src('app/layouts/app-layout/AppLayout.css'));
    const pageRule = layoutCss.slice(layoutCss.indexOf('.app-layout__page {'));
    expect(pageRule.slice(0, pageRule.indexOf('}'))).toMatch(/padding: var\(--space-8\);/);
    expect(stripComments(src('design-system/tokens.css'))).not.toMatch(/--app-frame-inset/);
    for (const file of ['app/layouts/page/cover/Page.Cover.css', 'app/layouts/page/Page.css']) {
      expect(stripComments(src(file))).not.toMatch(/(?:margin|padding)[a-z-]*:[^;]*tauri-drag-strip-height/);
    }
  });

  it('overlays the side cover with the strip above the image and below the cover actions', () => {
    const tsx = src('app/layouts/page/cover/Page.Cover.tsx');
    expect(tsx).toMatch(/layout === 'side' && <TauriDragStrip \/>/);
    // First child of the cover: the actions (same z-index, later in the DOM) stack over it.
    expect(tsx.indexOf('<TauriDragStrip />')).toBeLessThan(tsx.indexOf('className="page__cover__actions"'));
    expect(tsx.indexOf('<TauriDragStrip />')).toBeLessThan(tsx.indexOf('className="page-cover__image"'));

    const css = stripComments(src('app/layouts/page/cover/Page.Cover.css'));
    expect(css).toMatch(/\.page__cover > \.tauri-drag-strip \{\s*z-index: 1;\s*\}/);
    expect(css).toMatch(/\.page__cover\[data-repositioning\] > \.tauri-drag-strip \{\s*pointer-events: none;\s*\}/);
  });

  it('leaves the Welcome dialog room at the sides of the strip at the smallest supported window', () => {
    // The dialog is centred, so at the minimum window height (500, dialog 480 tall) it reaches into the strip's
    // height. It sits above the strip, so it keeps its pixels; the strip stays reachable beside it because the
    // minimum window is wider than the dialog.
    const config = JSON.parse(src('../src-tauri/tauri.conf.json')) as {
      app: { windows: { minWidth: number; minHeight: number }[] };
    };
    const { minWidth } = config.app.windows[0]!;
    const dialogWidth = Number(/--dialog-width-lg:\s*(\d+)px/.exec(src('design-system/tokens.css'))![1]);
    expect((minWidth - dialogWidth) / 2).toBeGreaterThanOrEqual(64);
  });

  it('never makes the cover or its image a drag region: only the separate strip overlay is one', () => {
    const tsx = src('app/layouts/page/cover/Page.Cover.tsx');
    expect(tsx).not.toMatch(/data-tauri-drag-region/);
    expect(tsx).not.toMatch(/<(?:aside|img|Button)\b[^>]*tauri-drag-strip/);
    // The cover's CSS only stacks the strip; it never turns a cover element into window chrome.
    expect(stripComments(src('app/layouts/page/cover/Page.Cover.css'))).not.toMatch(/app-region/);
  });

  it('keeps interactive controls out of the drag regions', () => {
    // A drag starts only when the pressed element itself carries the attribute, so the controls inside a
    // region stay clickable; none of them may carry it.
    const controls = stripComments(
      [
        src('app/layouts/page/topbar/Page.TopBar.tsx'),
        src('app/layouts/sidebar/controls/Controls.tsx'),
        src('app/layouts/app-layout/sidebar-toggle/SidebarToggle.tsx'),
        src('components/welcome-screen/WelcomeScreen.tsx'),
        src('components/welcome-screen/WelcomeScreenDialog.tsx'),
      ].join('\n')
    );
    expect(controls).not.toMatch(/<(?:button|Button|input|Input|a)\b[^>]*data-tauri-drag-region/);
    // The topbar's leading group is a plain wrapper; the Welcome dialog and its screens carry no drag region.
    expect(src('components/welcome-screen/WelcomeScreen.tsx')).not.toMatch(/data-tauri-drag-region/);
    expect(src('components/welcome-screen/WelcomeScreenDialog.tsx')).not.toMatch(/data-tauri-drag-region|TauriDragStrip/);
  });
});
