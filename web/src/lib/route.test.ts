import { describe, expect, it } from "vitest";
import { parseRoute, playHash } from "./route";

describe("parseRoute", () => {
  it.each([
    ["", { page: "parent" }],
    ["#", { page: "parent" }],
    ["#/", { page: "parent" }],
    ["#/somewhere/else", { page: "parent" }],
    ["#/play", { page: "parent" }],
    ["#/play/", { page: "parent" }],
    ["#/play/a1b2c3d4", { page: "play", id: "a1b2c3d4", speed: 1 }],
    ["#/play/sample", { page: "play", id: "sample", speed: 1 }],
    ["#/play/sample?speed=20", { page: "play", id: "sample", speed: 20 }],
    ["#/play/sample?speed=2.5", { page: "play", id: "sample", speed: 2.5 }],
    ["#/play/sample?speed=0", { page: "play", id: "sample", speed: 1 }],
    ["#/play/sample?speed=-3", { page: "play", id: "sample", speed: 1 }],
    ["#/play/sample?speed=fast", { page: "play", id: "sample", speed: 1 }],
    ["#/play/sample?speed=100000", { page: "play", id: "sample", speed: 100 }],
    ["#/play/../../etc", { page: "parent" }],
    ["#/play/a%2Fb", { page: "parent" }],
    ["#/play/a1b2c3d4/extra", { page: "parent" }],
  ])("%s", (hash, want) => {
    expect(parseRoute(hash)).toEqual(want);
  });
});

describe("playHash", () => {
  it("builds a play link that parses back", () => {
    expect(parseRoute(playHash("a1b2c3d4"))).toEqual({ page: "play", id: "a1b2c3d4", speed: 1 });
  });
});
