import { describe, expect, it } from "vitest";
import { formatClock, minutesUntil, playTimeLine, remainingMs, scaled } from "./timer";

describe("remainingMs", () => {
  it("counts down from the step length", () => {
    expect(remainingMs(1_000, 1_000, 60)).toBe(60_000);
    expect(remainingMs(1_000, 31_000, 60)).toBe(30_000);
  });

  it("is never negative", () => {
    expect(remainingMs(0, 10_000_000, 60)).toBe(0);
  });

  it("divides the length by the speed factor", () => {
    expect(remainingMs(0, 0, 60, 20)).toBe(3_000);
    expect(remainingMs(0, 1_500, 60, 20)).toBe(1_500);
  });

  it("treats a speed below 1 as normal speed", () => {
    expect(remainingMs(0, 0, 60, 0)).toBe(60_000);
    expect(remainingMs(0, 0, 60, -5)).toBe(60_000);
  });

  it("does not grow when the clock goes backwards", () => {
    expect(remainingMs(5_000, 4_000, 60)).toBe(60_000);
  });

  it("stays right after a long pause between ticks", () => {
    // A throttled tab may not tick for a while; the next tick is still right.
    expect(remainingMs(0, 45_000, 60)).toBe(15_000);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [1, "0:01"],
    [999, "0:01"],
    [1_000, "0:01"],
    [59_001, "1:00"],
    [60_000, "1:00"],
    [600_000, "10:00"],
    [-50, "0:00"],
  ])("%d ms -> %s", (ms, want) => {
    expect(formatClock(ms)).toBe(want);
  });
});

describe("scaled", () => {
  it("shortens fixed durations in demo mode", () => {
    expect(scaled(800, 1)).toBe(800);
    expect(scaled(800, 4)).toBe(200);
    expect(scaled(800, 0)).toBe(800);
  });
});

describe("minutesUntil", () => {
  const at = (h: number, m: number, s = 0) => new Date(2026, 9, 5, h, m, s);

  it("counts whole minutes to the leave time today", () => {
    expect(minutesUntil("08:10", at(7, 52))).toBe(18);
    expect(minutesUntil("08:10", at(7, 52, 30))).toBe(17);
  });

  it("is null when the time has passed or is now", () => {
    expect(minutesUntil("08:10", at(8, 10))).toBeNull();
    expect(minutesUntil("08:10", at(9, 0))).toBeNull();
    expect(minutesUntil("08:10", at(8, 9, 30))).toBeNull();
  });

  it("is null without a valid time", () => {
    expect(minutesUntil(undefined, at(7, 0))).toBeNull();
    expect(minutesUntil("", at(7, 0))).toBeNull();
    expect(minutesUntil("8:10", at(7, 0))).toBeNull();
    expect(minutesUntil("24:00", at(7, 0))).toBeNull();
  });
});

describe("playTimeLine", () => {
  it("says minute or minutes", () => {
    expect(playTimeLine(1)).toBe("You have 1 minute to play before liftoff.");
    expect(playTimeLine(12)).toBe("You have 12 minutes to play before liftoff.");
  });
});
