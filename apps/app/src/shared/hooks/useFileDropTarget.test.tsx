// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileDropTarget } from './useFileDropTarget';

const native = vi.hoisted(() => ({
  enabled: false,
  callback: undefined as undefined | ((event: { payload: any }) => void),
  stop: vi.fn(),
  registration: undefined as Promise<() => void> | undefined,
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.enabled }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async (fn) => {
      native.callback = fn;
      return native.registration ? await native.registration : native.stop;
    }),
  }),
}));
function Target({
  onDrop,
  onError = vi.fn(),
  targetFor,
}: {
  onDrop?: Parameters<typeof useFileDropTarget>[1];
  onError?: (error: unknown) => void;
  targetFor?: Parameters<typeof useFileDropTarget>[3];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drop = useFileDropTarget(ref, onDrop, onError, targetFor);
  return (
    <>
      <div ref={ref} data-testid="target" {...drop.props}>
        <span>Content</span>
        <div data-testid="folder" data-folder="trips">
          <span>Folder title</span>
        </div>
      </div>
      {drop.feedback}
    </>
  );
}
function event(type: string, types = ['Files'], files: File[] = []) {
  const value = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(value, {
    clientX: { value: 40 },
    clientY: { value: 50 },
    dataTransfer: { value: { types, files, dropEffect: 'none' } },
  });
  act(() => {
    screen.getByText('Content').dispatchEvent(value);
  });
  return value;
}
function emit(payload: any) {
  act(() => native.callback?.({ payload }));
}
beforeEach(() => {
  native.enabled = false;
  native.callback = undefined;
  native.registration = undefined;
  vi.clearAllMocks();
  vi.stubGlobal('devicePixelRatio', 2);
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => null,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared OS/browser file-drop target', () => {
  it('accepts DOM Files in order, highlights on enter/over, and clears on drop', async () => {
    const onDrop = vi.fn();
    render(<Target onDrop={onDrop} />);
    expect(event('dragenter').defaultPrevented).toBe(true);
    expect(
      document.querySelector('[data-drop-feedback="inside"]')
    ).not.toBeNull();
    expect(event('dragover').defaultPrevented).toBe(true);
    const files = [new File(['a'], 'a.png'), new File(['b'], 'b.pdf')];
    expect(event('drop', ['Files'], files).defaultPrevented).toBe(true);
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      files,
      { x: 40, y: 50 },
      screen.getByTestId('target')
    );
    expect(document.querySelector('[data-drop-feedback]')).toBeNull();
  });
  it('leaves internal text and selection dragging to the editor', () => {
    const onDrop = vi.fn();
    render(<Target onDrop={onDrop} />);
    for (const type of ['dragenter', 'dragover', 'drop'])
      expect(event(type, ['text/plain']).defaultPrevented).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
    expect(document.querySelector('[data-drop-feedback]')).toBeNull();
  });
  it('clears feedback when a drag leaves the target', () => {
    render(<Target onDrop={vi.fn()} />);
    event('dragenter');
    event('dragleave');
    expect(document.querySelector('[data-drop-feedback]')).toBeNull();
  });
  it('prevents browser navigation without importing into a disabled target', () => {
    render(<Target />);
    expect(
      event('drop', ['Files'], [new File(['a'], 'a.png')]).defaultPrevented
    ).toBe(true);
    expect(document.querySelector('[data-drop-feedback]')).toBeNull();
  });
  it('converts native physical pixels, retains enter paths across over, and imports once', async () => {
    native.enabled = true;
    const onDrop = vi.fn();
    const { unmount } = render(<Target onDrop={onDrop} />);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => screen.getByText('Content')),
    });
    await waitFor(() => expect(native.callback).toBeDefined());
    emit({
      type: 'enter',
      paths: ['/Finder/a.png'],
      position: { x: 80, y: 100 },
    });
    emit({ type: 'over', position: { x: 80, y: 100 } });
    expect(document.elementFromPoint).toHaveBeenCalledWith(40, 50);
    expect(document.querySelector('[data-drop-feedback]')).not.toBeNull();
    event('drop', ['Files'], [new File(['a'], 'a.png')]);
    expect(onDrop).not.toHaveBeenCalled();
    emit({
      type: 'drop',
      paths: ['/Finder/a.png', '/Finder/b.pdf'],
      position: { x: 80, y: 100 },
    });
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      ['/Finder/a.png', '/Finder/b.pdf'],
      { x: 40, y: 50 },
      screen.getByTestId('target')
    );
    unmount();
    expect(native.stop).toHaveBeenCalledOnce();
  });
  it('ignores native drops outside this surface, including over an overlay', async () => {
    native.enabled = true;
    const onDrop = vi.fn();
    render(<Target onDrop={onDrop} />);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.body,
    });
    await waitFor(() => expect(native.callback).toBeDefined());
    emit({ type: 'drop', paths: ['/a.png'], position: { x: 20, y: 20 } });
    expect(onDrop).not.toHaveBeenCalled();
  });
  it('ignores native enter/drop events with no OS paths (internal drags)', async () => {
    native.enabled = true;
    const onDrop = vi.fn();
    render(<Target onDrop={onDrop} />);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => screen.getByText('Content'),
    });
    await waitFor(() => expect(native.callback).toBeDefined());
    emit({ type: 'enter', paths: [], position: { x: 80, y: 100 } });
    emit({ type: 'drop', paths: [], position: { x: 80, y: 100 } });
    expect(onDrop).not.toHaveBeenCalled();
  });
  it('clears native feedback on leave/cancel', async () => {
    native.enabled = true;
    render(<Target onDrop={vi.fn()} />);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => screen.getByText('Content'),
    });
    await waitFor(() => expect(native.callback).toBeDefined());
    emit({ type: 'enter', paths: ['/a.png'], position: { x: 80, y: 100 } });
    emit({ type: 'leave' });
    expect(document.querySelector('[data-drop-feedback]')).toBeNull();
  });
  it('reports an asynchronous import failure', async () => {
    const error = new Error('denied');
    const onError = vi.fn();
    render(
      <Target onDrop={vi.fn().mockRejectedValue(error)} onError={onError} />
    );
    event('drop', ['Files'], [new File(['a'], 'a.png')]);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
  });
  it('unsubscribes a listener that finishes registering after unmount', async () => {
    native.enabled = true;
    let finish!: (stop: () => void) => void;
    native.registration = new Promise((resolve) => {
      finish = resolve;
    });
    const onDrop = vi.fn();
    const { unmount } = render(<Target onDrop={onDrop} />);
    unmount();
    await act(async () => {
      finish(native.stop);
      await Promise.resolve();
    });
    expect(native.stop).toHaveBeenCalledOnce();
    emit({ type: 'drop', paths: ['/late.png'], position: { x: 80, y: 100 } });
    expect(onDrop).not.toHaveBeenCalled();
  });
  it('uses the same nested folder for native highlight and import, including its title', async () => {
    native.enabled = true;
    const onDrop = vi.fn();
    render(
      <Target
        onDrop={onDrop}
        targetFor={(hit, surface) =>
          hit.closest<HTMLElement>('[data-folder]') ?? surface
        }
      />
    );
    const folder = screen.getByTestId('folder');
    vi.spyOn(folder, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 200,
      height: 60,
    } as DOMRect);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => screen.getByText('Folder title'),
    });
    await waitFor(() => expect(native.callback).toBeDefined());
    emit({ type: 'enter', paths: ['/photo.png'], position: { x: 80, y: 100 } });
    const feedback = document.querySelector<HTMLElement>(
      '[data-drop-feedback]'
    )!;
    expect(feedback.style.left).toBe('10px');
    expect(feedback.style.width).toBe('200px');
    emit({ type: 'drop', paths: ['/photo.png'], position: { x: 80, y: 100 } });
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      ['/photo.png'],
      { x: 40, y: 50 },
      folder
    );
  });
  it('does not import DOM file drops from a portaled overlay', () => {
    const onDrop = vi.fn();
    function PortalTarget() {
      const ref = useRef<HTMLDivElement>(null);
      const target = useFileDropTarget(ref, onDrop, vi.fn());
      return (
        <div ref={ref} {...target.props}>
          {createPortal(<span>Overlay</span>, document.body)}
        </div>
      );
    }
    render(<PortalTarget />);
    const value = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(value, 'dataTransfer', {
      value: { types: ['Files'], files: [new File(['x'], 'photo.png')] },
    });
    act(() => {
      screen.getByText('Overlay').dispatchEvent(value);
    });
    expect(onDrop).not.toHaveBeenCalled();
  });
  it('does not let DOM child transitions clear or repaint an active native folder highlight', async () => {
    native.enabled = true;
    const onDrop = vi.fn();
    render(
      <Target
        onDrop={onDrop}
        targetFor={(hit, surface) =>
          hit.closest<HTMLElement>('[data-folder]') ?? surface
        }
      />
    );
    const folder = screen.getByTestId('folder');
    vi.spyOn(folder, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 200,
      height: 60,
    } as DOMRect);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => screen.getByText('Folder title'),
    });
    await waitFor(() => expect(native.callback).toBeDefined());
    emit({ type: 'enter', paths: ['/photo.png'], position: { x: 80, y: 100 } });
    expect(
      document.querySelector<HTMLElement>('[data-drop-feedback]')!.style.left
    ).toBe('10px');
    // These DOM events target another child and have no relatedTarget, while the OS drag is still inside.
    for (const type of ['dragleave', 'dragenter', 'dragover', 'drop']) {
      event(type, ['Files'], [new File(['x'], 'photo.png')]);
      expect(
        document.querySelector<HTMLElement>('[data-drop-feedback]')!.style.left
      ).toBe('10px');
    }
    expect(onDrop).not.toHaveBeenCalled();
    emit({ type: 'drop', paths: ['/photo.png'], position: { x: 80, y: 100 } });
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      ['/photo.png'],
      { x: 40, y: 50 },
      folder
    );
    expect(document.querySelector('[data-drop-feedback]')).toBeNull();
  });
  it('keeps browser feedback when a null-relatedTarget dragleave still points inside the page', () => {
    render(<Target onDrop={vi.fn()} />);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => screen.getByText('Content'),
    });
    event('dragenter');
    event('dragleave');
    expect(document.querySelector('[data-drop-feedback]')).not.toBeNull();
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.body,
    });
    event('dragleave');
    expect(document.querySelector('[data-drop-feedback]')).toBeNull();
  });
  it.each([
    ['MacIntel', 2, 300],
    ['MacIntel', 1, 300],
    ['Win32', 2, 600],
  ])(
    'hit-tests the left side of the page correctly on %s at scale %s',
    async (platform, dpr, nativeX) => {
      native.enabled = true;
      vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
      vi.stubGlobal('devicePixelRatio', dpr);
      const onDrop = vi.fn();
      render(
        <Target
          onDrop={onDrop}
          targetFor={(hit, surface) =>
            hit.closest<HTMLElement>('[data-folder]') ?? surface
          }
        />
      );
      // The sidebar occupies x=0..279; the folder is just inside the page at x=300.
      const hitTest = vi.fn((x: number) =>
        x >= 280 ? screen.getByText('Folder title') : document.body
      );
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: hitTest,
      });
      await waitFor(() => expect(native.callback).toBeDefined());
      emit({
        type: 'enter',
        paths: ['/photo.png'],
        position: { x: nativeX, y: 100 },
      });
      expect(hitTest).toHaveBeenCalledWith(
        300,
        platform === 'MacIntel' ? 100 : 50
      );
      expect(document.querySelector('[data-drop-feedback]')).not.toBeNull();
      emit({
        type: 'drop',
        paths: ['/photo.png'],
        position: { x: nativeX, y: 100 },
      });
      expect(onDrop).toHaveBeenCalledExactlyOnceWith(
        ['/photo.png'],
        { x: 300, y: platform === 'MacIntel' ? 100 : 50 },
        screen.getByTestId('folder')
      );
    }
  );
});
