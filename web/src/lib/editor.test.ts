import { describe, expect, it } from "vitest";
import type { Mission } from "./api";
import { addStep, blankStep, deleteStep, MAX_STEPS, moveItem, moveStep, parseFieldErrors, setMode, toDraft, updateStep, updateText } from "./editor";

const step = (title: string, mode: "until_done" | "for_duration" = "until_done", seconds = 60) => ({
  emoji: "🚀",
  title,
  say: `${title}, Captain.`,
  mode,
  seconds,
});

const mission = (): Mission => ({
  title: "Morning",
  intro: "Let's go.",
  steps: [step("one"), step("two", "for_duration"), step("three")],
  finale: "Done.",
});

const titles = (m: Mission) => m.steps.map((s) => s.title);

describe("moveStep", () => {
  it("moves a step up and down", () => {
    expect(titles(moveStep(mission(), 1, -1))).toEqual(["two", "one", "three"]);
    expect(titles(moveStep(mission(), 1, 1))).toEqual(["one", "three", "two"]);
  });

  it("does nothing at the edges", () => {
    expect(titles(moveStep(mission(), 0, -1))).toEqual(["one", "two", "three"]);
    expect(titles(moveStep(mission(), 2, 1))).toEqual(["one", "two", "three"]);
    expect(titles(moveStep(mission(), 7, 1))).toEqual(["one", "two", "three"]);
  });

  it("does not change the input", () => {
    const m = mission();
    moveStep(m, 0, 1);
    expect(titles(m)).toEqual(["one", "two", "three"]);
  });
});

describe("moveItem", () => {
  it("moves keys the same way as steps", () => {
    expect(moveItem([10, 20, 30], 2, -1)).toEqual([10, 30, 20]);
  });
});

describe("deleteStep", () => {
  it("removes the step", () => {
    expect(titles(deleteStep(mission(), 1))).toEqual(["one", "three"]);
  });

  it("can delete the last step; the server then says there are too few", () => {
    let m = mission();
    m = deleteStep(m, 2);
    m = deleteStep(m, 1);
    m = deleteStep(m, 0);
    expect(m.steps).toEqual([]);
    expect(deleteStep(m, 0).steps).toEqual([]);
  });
});

describe("addStep", () => {
  it("adds a blank step at the end", () => {
    const m = addStep(mission());
    expect(m.steps).toHaveLength(4);
    expect(m.steps[3]).toEqual(blankStep());
  });

  it("stops at eight steps", () => {
    let m = mission();
    for (let i = 0; i < 10; i++) m = addStep(m);
    expect(m.steps).toHaveLength(MAX_STEPS);
  });
});

describe("updateStep and updateText", () => {
  it("changes one field of one step", () => {
    const m = updateStep(mission(), 1, { title: "Polish the top deck" });
    expect(titles(m)).toEqual(["one", "Polish the top deck", "three"]);
    expect(m.steps[1].say).toBe("two, Captain.");
  });

  it("ignores an index out of range", () => {
    expect(updateStep(mission(), 5, { title: "x" })).toEqual(mission());
  });

  it("changes mission text", () => {
    expect(updateText(mission(), "finale", "Liftoff!").finale).toBe("Liftoff!");
  });
});

describe("setMode", () => {
  it("keeps seconds that fit the new mode", () => {
    const m = setMode(mission(), 0, "for_duration");
    expect(m.steps[0]).toMatchObject({ mode: "for_duration", seconds: 60 });
  });

  it("resets seconds that do not fit", () => {
    let m = updateStep(mission(), 0, { seconds: 600 });
    m = setMode(m, 0, "for_duration");
    expect(m.steps[0]).toMatchObject({ mode: "for_duration", seconds: 60 });
    m = updateStep(m, 0, { seconds: 15 });
    m = setMode(m, 0, "until_done");
    expect(m.steps[0]).toMatchObject({ mode: "until_done", seconds: 120 });
  });
});

describe("parseFieldErrors", () => {
  it("maps server messages to field paths", () => {
    expect(
      parseFieldErrors([
        "steps[1].title: too many words (at most 6)",
        "title: required",
        "steps: too few (at least 3)",
      ]),
    ).toEqual({
      "steps[1].title": "Too many words (at most 6).",
      title: "Required.",
      steps: "Too few (at least 3).",
    });
  });

  it("joins two messages for the same field", () => {
    expect(parseFieldErrors(["steps[0].title: too long (at most 40 characters)", "steps[0].title: too many words (at most 6)"])).toEqual({
      "steps[0].title": "Too long (at most 40 characters). Too many words (at most 6).",
    });
  });

  it("keeps a message without a field", () => {
    expect(parseFieldErrors(["output: not valid JSON", "something odd"])).toEqual({
      output: "Not valid JSON.",
      "": "Something odd.",
    });
  });
});

describe("toDraft", () => {
  it("drops the server fields and copies the steps", () => {
    const saved = { ...mission(), id: "a1b2c3d4", created_at: "2026-10-04T22:00:00Z" };
    const d = toDraft(saved);
    expect(d).not.toHaveProperty("id");
    expect(d).not.toHaveProperty("created_at");
    d.steps[0].title = "changed";
    expect(saved.steps[0].title).toBe("one");
  });
});
