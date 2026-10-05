import { describe, expect, it } from "vitest";
import { formatClock, remainingMs, scaled } from "./timer";

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
