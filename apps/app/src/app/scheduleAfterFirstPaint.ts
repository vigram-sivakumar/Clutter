/**
 * Runs `task` once, after the page has painted a frame — two animation frames
 * and then a macrotask, so it never sits in the same frame as the render that
 * just committed. A hidden window schedules no frames, so a timeout runs it
 * anyway. Returns a cancel function.
 *
 * Deliberately not a job framework: it exists so background housekeeping (the
 * parsed-note cache write) cannot compete with window reveal or the first
 * usable workspace.
 */
export function scheduleAfterFirstPaint(
  task: () => void,
  fallbackMs = 3000
): () => void {
  let done = false;
  let frame1 = 0;
  let frame2 = 0;
  let afterFrames: ReturnType<typeof setTimeout> | undefined;
  let fallback: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    done = true;
    cancelAnimationFrame(frame1);
    cancelAnimationFrame(frame2);
    clearTimeout(afterFrames);
    clearTimeout(fallback);
  };
  const run = () => {
    if (done) return;
    cancel();
    task();
  };

  frame1 = requestAnimationFrame(() => {
    frame2 = requestAnimationFrame(() => {
      afterFrames = setTimeout(run, 0);
    });
  });
  fallback = setTimeout(run, fallbackMs);
  return cancel;
}
