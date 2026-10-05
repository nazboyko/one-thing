// Timers are computed from timestamps, never from counting ticks, so a
// throttled or backgrounded tab still shows the right time.

/** Milliseconds left in a step that started at `startedAt`. Never negative. */
export function remainingMs(startedAt: number, now: number, seconds: number, speed = 1): number {
  const total = (seconds * 1000) / Math.max(speed, 1);
  return Math.max(0, total - Math.max(0, now - startedAt));
}

/** "m:ss", rounded up so the clock shows 0:00 only when time is really up. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Scales a fixed duration by the demo speed. */
export function scaled(ms: number, speed = 1): number {
  return ms / Math.max(speed, 1);
}
