import { describe, expect, it } from "vitest";
import { createHold, DRAIN_MS, HOLD_MS, isMoving, press, progress, release, setDisabled, tick, type Hold } from "./hold";

/** Runs animation frames every 16 ms from `from` to `to` and counts fires. */
function frames(h: Hold, from: number, to: number): { hold: Hold; fires: number } {
  let fires = 0;
  for (let t = from; t <= to; t += 16) {
    const r = tick(h, t);
    h = r.hold;
    if (r.fired) fires++;
  }
  return { hold: h, fires };
}

describe("hold to confirm", () => {
  it("does nothing on a short press", () => {
    let h = press(createHold(), 0);
    h = frames(h, 0, 300).hold;
    h = release(h, 300);
    const r = frames(h, 300, 3_000);
    expect(r.fires).toBe(0);
    expect(r.hold.fired).toBe(false);
  });

  it("ignores ten fast taps", () => {
    let h = createHold();
    let fires = 0;
    for (let i = 0; i < 10; i++) {
      const t = i * 120;
      h = press(h, t);
      const r = frames(h, t, t + 60);
      h = release(r.hold, t + 60);
      fires += r.fires;
    }
    expect(fires).toBe(0);
    expect(frames(h, 1_200, 4_000).fires).toBe(0);
  });

  it("fires once after 800 ms", () => {
    const h = press(createHold(), 1_000);
    expect(tick(h, 1_000 + HOLD_MS - 1).fired).toBe(false);
    const r = frames(h, 1_000, 1_000 + HOLD_MS * 4);
    expect(r.fires).toBe(1);
    expect(r.hold.fired).toBe(true);
  });

  it("stays fired: no second press, release or tick fires again", () => {
    let h = frames(press(createHold(), 0), 0, HOLD_MS + 32).hold;
    h = release(h, 900);
    h = press(h, 1_000);
    expect(frames(h, 1_000, 3_000).fires).toBe(0);
    expect(progress(h, 5_000)).toBe(1);
  });

  it("drains after an early release", () => {
    let h = press(createHold(), 0);
    h = release(h, HOLD_MS / 2);
    expect(progress(h, HOLD_MS / 2)).toBeCloseTo(0.5);
    expect(progress(h, HOLD_MS / 2 + DRAIN_MS / 4)).toBeCloseTo(0.25);
    expect(progress(h, HOLD_MS / 2 + DRAIN_MS)).toBe(0);
    expect(isMoving(h, HOLD_MS / 2 + DRAIN_MS + 1)).toBe(false);
  });

  it("resumes from the drained level on a quick re-press", () => {
    let h = press(createHold(), 0);
    h = release(h, 400); // progress 0.5
    h = press(h, 500); // drained by 0.25, so 0.25 left
    expect(progress(h, 500)).toBeCloseTo(0.25);
    const fireAt = 500 + HOLD_MS * 0.75;
    expect(tick(h, fireAt - 2).fired).toBe(false);
    expect(tick(h, fireAt + 1).fired).toBe(true);
  });

  it("ignores input while disabled", () => {
    let h = createHold(true);
    h = press(h, 0);
    expect(h.pressedAt).toBeNull();
    expect(frames(h, 0, 2_000).fires).toBe(0);
    expect(progress(h, 2_000)).toBe(0);
  });

  it("cancels a press when it becomes disabled, and works once enabled", () => {
    let h = press(createHold(), 0);
    h = setDisabled(h, true, 300);
    expect(h.pressedAt).toBeNull();
    expect(frames(h, 300, 2_000).fires).toBe(0);
    h = setDisabled(h, false, 2_000);
    h = press(h, 2_000);
    expect(frames(h, 2_000, 2_000 + HOLD_MS + 16).fires).toBe(1);
  });

  it("does not double-press", () => {
    const h = press(createHold(), 0);
    expect(press(h, 500)).toBe(h);
  });
});
