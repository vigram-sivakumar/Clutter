import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { isMacPlatform } from '@shared/interaction/platform';
import { DropFeedback } from '@components/drag-ghost/DropFeedback';

export type DroppedFile = string | File;
export interface DropPoint {
  readonly x: number;
  readonly y: number;
}
export interface FileDropOptions {
  readonly onDrop: (
    files: readonly DroppedFile[],
    point: DropPoint,
    target: HTMLElement
  ) => void | Promise<void>;
  readonly onError: (error: unknown) => void;
  /** A nested destination (e.g. a folder card), the page itself, or null for an unavailable target. */
  readonly targetFor?: (
    hit: Element,
    surface: HTMLElement
  ) => HTMLElement | null;
}

/** One native/DOM file-drop bridge. Text/URI drags never enter the asset pipeline. */
export function useFileDropTarget(
  ref: RefObject<HTMLElement>,
  onDrop: FileDropOptions['onDrop'] | undefined,
  onError: FileDropOptions['onError'],
  targetFor?: FileDropOptions['targetFor']
) {
  const current = useRef({ onDrop, onError, targetFor });
  current.current = { onDrop, onError, targetFor };
  const [rect, setRect] = useState<DOMRect | null>(null);
  const enabled = onDrop !== undefined;
  const resolveTarget = (hit: Element | null): HTMLElement | null => {
    const surface = ref.current;
    // React portals can bubble through the Page tree, but are not part of its DOM surface.
    if (!surface || !hit || !surface.contains(hit)) return null;
    const target = current.current.targetFor
      ? current.current.targetFor(hit, surface)
      : surface;
    return target && surface.contains(target) ? target : null;
  };
  const highlight = (target: HTMLElement | null) =>
    setRect(target?.getBoundingClientRect() ?? null);
  const receive = (
    files: readonly DroppedFile[],
    point: DropPoint,
    target: HTMLElement
  ) => {
    highlight(null);
    if (!files.length) return;
    try {
      void Promise.resolve(
        current.current.onDrop?.(files, point, target)
      ).catch(current.current.onError);
    } catch (error) {
      current.current.onError(error);
    }
  };

  useEffect(() => {
    if (!enabled || !isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let paths: readonly string[] = [];
    void getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (disposed) return;
        if (payload.type === 'leave') {
          paths = [];
          highlight(null);
          return;
        }
        if (payload.type === 'enter' || payload.type === 'drop')
          paths = payload.paths;
        // Pinned Wry 0.55.1 emits AppKit logical points on macOS. Tauri runtime-wry 2.11.4
        // wraps them as PhysicalPosition without scaling. Dividing those points by Retina DPR
        // shifts the hit-test into the sidebar. Retain the documented physical conversion elsewhere.
        const scale = isMacPlatform() ? 1 : window.devicePixelRatio || 1;
        const point = {
          x: payload.position.x / scale,
          y: payload.position.y / scale,
        };
        const target = paths.length
          ? resolveTarget(document.elementFromPoint(point.x, point.y))
          : null;
        highlight(payload.type !== 'drop' ? target : null);
        if (payload.type === 'drop') {
          if (target) receive(paths, point, target);
          paths = [];
        }
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error) => {
        if (!disposed) current.current.onError(error);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [enabled, ref]);

  useEffect(() => {
    if (!enabled) highlight(null);
  }, [enabled]);
  const filesOnly = (data: DataTransfer | null) =>
    !!data && Array.from(data.types).includes('Files');
  const eventTarget = (event: DragEvent<HTMLElement>) =>
    resolveTarget(event.target instanceof Element ? event.target : null);
  const hover = (event: DragEvent<HTMLElement>) => {
    if (!filesOnly(event.dataTransfer)) return;
    const target = eventTarget(event);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = enabled ? 'copy' : 'none';
    // Finder/native events own desktop feedback. DOM child transitions can report a null relatedTarget;
    // allowing that second event stream to paint/clear the indicator makes valid regions flicker or disappear.
    if (!isTauri()) highlight(enabled ? target : null);
  };
  return {
    props: {
      onDragEnterCapture: hover,
      onDragOverCapture: hover,
      onDragLeaveCapture: (event: DragEvent<HTMLElement>) => {
        if (!filesOnly(event.dataTransfer) || isTauri()) return;
        // Browser dragleave also fires while crossing children. When relatedTarget is unavailable,
        // hit-test the pointer instead of treating every such event as leaving the whole page.
        const hit =
          event.relatedTarget instanceof Element
            ? event.relatedTarget
            : (document.elementFromPoint?.(event.clientX, event.clientY) ??
              null);
        const next = resolveTarget(hit);
        highlight(enabled ? next : null);
      },
      onDropCapture: (event: DragEvent<HTMLElement>) => {
        if (!filesOnly(event.dataTransfer)) return;
        const target = eventTarget(event);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        // Native paths own desktop drops; DOM Files are the browser fallback, never a second import.
        if (!isTauri()) {
          highlight(null);
          if (enabled)
            receive(
              Array.from(event.dataTransfer.files),
              { x: event.clientX, y: event.clientY },
              target
            );
        }
      },
    },
    feedback:
      rect && enabled ? (
        <DropFeedback shape={{ kind: 'inside', rect }} />
      ) : null,
  };
}
