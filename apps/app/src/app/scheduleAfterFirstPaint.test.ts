import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleAfterFirstPaint } from './scheduleAfterFirstPaint';

describe('scheduleAfterFirstPaint', () => {
  let frames: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
      frames.push(callback)
    );
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const nextFrame = () => frames.shift()?.();

  it('runs only after two painted frames and a macrotask, never in the committing frame', () => {
    const task = vi.fn();
    scheduleAfterFirstPaint(task);

    expect(task).not.toHaveBeenCalled();
    nextFrame();
    expect(task).not.toHaveBeenCalled();
    nextFrame();
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledOnce();
  });

  it('still runs when the page is hidden and no frame is ever scheduled', () => {
    const task = vi.fn();
    scheduleAfterFirstPaint(task, 3000);
    vi.advanceTimersByTime(2999);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledOnce();
  });

  it('runs once even if both paths fire', () => {
    const task = vi.fn();
    scheduleAfterFirstPaint(task, 100);
    nextFrame();
    nextFrame();
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledOnce();
  });

  it('can be cancelled before it runs', () => {
    const task = vi.fn();
    const cancel = scheduleAfterFirstPaint(task, 100);
    cancel();
    nextFrame();
    nextFrame();
    vi.advanceTimersByTime(1000);
    expect(task).not.toHaveBeenCalled();
  });
});
