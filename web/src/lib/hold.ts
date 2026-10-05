// Hold-to-confirm: the launch button fires only after it has been held for
// HOLD_MS. Releasing early drains the ring; a quick tap does nothing. Every
// function is pure and takes the current time, so it can be tested without
// a browser.

export const HOLD_MS = 800;
export const DRAIN_MS = 400;

export interface Hold {
  readonly disabled: boolean;
  /** Virtual start of the current press, or null when not pressed. */
  readonly pressedAt: number | null;
  readonly releasedAt: number;
  readonly releasedProgress: number;
  readonly fired: boolean;
}

export function createHold(disabled = false): Hold {
  return { disabled, pressedAt: null, releasedAt: 0, releasedProgress: 0, fired: false };
}

/** Ring fill from 0 to 1. */
export function progress(h: Hold, now: number): number {
  if (h.fired) return 1;
  if (h.pressedAt !== null) return clamp01((now - h.pressedAt) / HOLD_MS);
  const drained = h.releasedProgress - (now - h.releasedAt) / DRAIN_MS;
  return clamp01(drained);
}

export function press(h: Hold, now: number): Hold {
  if (h.disabled || h.fired || h.pressedAt !== null) return h;
  // Resume from whatever is left of the ring, so a quick re-press after an
  // early release does not start from zero.
  const start = now - progress(h, now) * HOLD_MS;
  return { ...h, pressedAt: start };
}

export function release(h: Hold, now: number): Hold {
  if (h.pressedAt === null || h.fired) return h;
  return { ...h, pressedAt: null, releasedAt: now, releasedProgress: progress(h, now) };
}

/** Advances the hold. `fired` is true exactly once, on the frame it completes. */
export function tick(h: Hold, now: number): { hold: Hold; fired: boolean } {
  if (h.fired || h.disabled || h.pressedAt === null) return { hold: h, fired: false };
  if (progress(h, now) < 1) return { hold: h, fired: false };
  return { hold: { ...h, fired: true, pressedAt: null }, fired: true };
}

export function setDisabled(h: Hold, disabled: boolean, now: number): Hold {
  if (h.disabled === disabled) return h;
  const released = disabled ? release(h, now) : h;
  return { ...released, disabled };
}

/** True while the ring still needs animation frames. */
export function isMoving(h: Hold, now: number): boolean {
  if (h.fired) return false;
  return h.pressedAt !== null || progress(h, now) > 0;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
