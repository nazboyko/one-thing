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

/**
 * Whole minutes from `now` until "HH:MM" today, or null when the time is
 * empty, malformed or already past. Used for "You have N minutes to play".
 */
export function minutesUntil(leaveAt: string | undefined, now: Date): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(leaveAt ?? "");
  if (!m) return null;
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const minutes = Math.floor((target.getTime() - now.getTime()) / 60_000);
  return minutes > 0 ? minutes : null;
}

export function playTimeLine(minutes: number): string {
  return `You have ${minutes} ${minutes === 1 ? "minute" : "minutes"} to play before liftoff.`;
}
