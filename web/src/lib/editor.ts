// Pure editing helpers for the parent screen. Each returns a new mission and
// never changes its input. The server holds the rules; these only edit.

import type { Mission, Mode, Step } from "./api";

export const MAX_STEPS = 8;

export const DEFAULT_SECONDS: Record<Mode, number> = { until_done: 120, for_duration: 60 };
const RANGE: Record<Mode, [number, number]> = { until_done: [30, 1200], for_duration: [10, 300] };

export function blankStep(): Step {
  return { emoji: "⭐", title: "", say: "", mode: "until_done", seconds: DEFAULT_SECONDS.until_done };
}

export function moveItem<T>(list: readonly T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function removeItem<T>(list: readonly T[], i: number): T[] {
  return list.filter((_, k) => k !== i);
}

export function moveStep(m: Mission, i: number, delta: -1 | 1): Mission {
  return { ...m, steps: moveItem(m.steps, i, delta) };
}

export function deleteStep(m: Mission, i: number): Mission {
  return { ...m, steps: removeItem(m.steps, i) };
}

export function addStep(m: Mission): Mission {
  if (m.steps.length >= MAX_STEPS) return m;
  return { ...m, steps: [...m.steps, blankStep()] };
}

export function updateStep(m: Mission, i: number, patch: Partial<Step>): Mission {
  if (i < 0 || i >= m.steps.length) return m;
  return { ...m, steps: m.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) };
}

/** Switching the mode keeps the seconds when they fit the new mode. */
export function setMode(m: Mission, i: number, mode: Mode): Mission {
  const step = m.steps[i];
  if (!step) return m;
  const [lo, hi] = RANGE[mode];
  const seconds = step.seconds >= lo && step.seconds <= hi ? step.seconds : DEFAULT_SECONDS[mode];
  return updateStep(m, i, { mode, seconds });
}

export function updateText(m: Mission, field: "title" | "intro" | "finale", value: string): Mission {
  return { ...m, [field]: value };
}

/** Turns ["steps[1].title: too long"] into { "steps[1].title": "Too long" }. */
export function parseFieldErrors(fields: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const at = f.indexOf(": ");
    const key = at < 0 ? "" : f.slice(0, at);
    const msg = at < 0 ? f : f.slice(at + 2);
    const text = msg.charAt(0).toUpperCase() + msg.slice(1);
    out[key] = out[key] ? `${out[key]} ${text}.` : `${text}.`;
  }
  return out;
}

/** A mission copy without the server's fields, ready to edit. */
export function toDraft(m: Mission): Mission {
  return { title: m.title, intro: m.intro, steps: m.steps.map((s) => ({ ...s })), finale: m.finale, leave_at: m.leave_at };
}
