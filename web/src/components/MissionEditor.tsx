import { useRef, type ReactNode } from "react";
import type { Mission, Mode } from "../lib/api";
import { addStep, deleteStep, MAX_STEPS, moveItem, moveStep, removeItem, setMode, updateStep, updateText } from "../lib/editor";

interface Props {
  mission: Mission;
  keys: number[];
  errors: Record<string, string>;
  onChange: (mission: Mission, keys: number[], changed?: string) => void;
}

// Section 2: every word the child will hear, editable before approval.
export function MissionEditor({ mission, keys, errors, onChange }: Props) {
  const nextKey = useRef(Math.max(0, ...keys) + 1);
  const edit = (m: Mission, changed: string) => onChange(m, keys, changed);

  return (
    <div className="editor">
      <Field id="m-title" label="Mission title" error={errors["title"]}>
        <input
          id="m-title"
          className="input input--title"
          value={mission.title}
          maxLength={80}
          onChange={(e) => edit(updateText(mission, "title", e.target.value), "title")}
        />
      </Field>
      <Field id="m-intro" label="First line, said at the start" error={errors["intro"]}>
        <textarea
          id="m-intro"
          className="input input--grow"
          rows={1}
          value={mission.intro}
          onChange={(e) => edit(updateText(mission, "intro", e.target.value), "intro")}
        />
      </Field>

      <ol className="steps" aria-label="Steps">
        {mission.steps.map((step, i) => {
          const p = `steps[${i}]`;
          const n = i + 1;
          return (
            <li key={keys[i]} className="step">
              <span className="step__num" aria-hidden="true">
                {n}
              </span>
              <div className="step__grid">
                <Field id={`s${keys[i]}-emoji`} label={`Step ${n} emoji`} hidden error={errors[`${p}.emoji`]} className="step__emoji">
                  <input
                    id={`s${keys[i]}-emoji`}
                    className="input input--emoji"
                    value={step.emoji}
                    onChange={(e) => edit(updateStep(mission, i, { emoji: e.target.value }), `${p}.emoji`)}
                  />
                </Field>
                <Field id={`s${keys[i]}-title`} label={`Step ${n} title`} hidden error={errors[`${p}.title`]} className="step__title">
                  <input
                    id={`s${keys[i]}-title`}
                    className="input input--step-title"
                    value={step.title}
                    placeholder="Up to six words"
                    onChange={(e) => edit(updateStep(mission, i, { title: e.target.value }), `${p}.title`)}
                  />
                </Field>
                <Field id={`s${keys[i]}-say`} label={`Step ${n}, said out loud`} hidden error={errors[`${p}.say`]} className="step__say">
                  <textarea
                    id={`s${keys[i]}-say`}
                    className="input input--say input--grow"
                    rows={1}
                    value={step.say}
                    placeholder="What the screen says out loud"
                    onChange={(e) => edit(updateStep(mission, i, { say: e.target.value }), `${p}.say`)}
                  />
                </Field>
                <Field id={`s${keys[i]}-mode`} label={`Step ${n} kind`} hidden error={errors[`${p}.mode`]} className="step__mode">
                  <select
                    id={`s${keys[i]}-mode`}
                    className="input input--select"
                    value={step.mode}
                    onChange={(e) => edit(setMode(mission, i, e.target.value as Mode), `${p}.seconds`)}
                  >
                    <option value="until_done">Hold when done</option>
                    <option value="for_duration">Timed</option>
                  </select>
                </Field>
                <Field id={`s${keys[i]}-sec`} label={`Step ${n} seconds`} hidden error={errors[`${p}.seconds`]} className="step__seconds">
                  <span className="seconds">
                    <input
                      id={`s${keys[i]}-sec`}
                      className="input input--seconds"
                      type="number"
                      inputMode="numeric"
                      value={Number.isFinite(step.seconds) ? step.seconds : ""}
                      onChange={(e) => edit(updateStep(mission, i, { seconds: parseInt(e.target.value, 10) }), `${p}.seconds`)}
                    />
                    <span aria-hidden="true">s</span>
                  </span>
                </Field>
                <div className="step__tools">
                  <button
                    type="button"
                    className="tool"
                    aria-label={`Move step ${n} up`}
                    disabled={i === 0}
                    onClick={() => onChange(moveStep(mission, i, -1), moveItem(keys, i, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="tool"
                    aria-label={`Move step ${n} down`}
                    disabled={i === mission.steps.length - 1}
                    onClick={() => onChange(moveStep(mission, i, 1), moveItem(keys, i, 1))}
                  >
                    ↓
                  </button>
                  <button type="button" className="tool" aria-label={`Delete step ${n}`} onClick={() => onChange(deleteStep(mission, i), removeItem(keys, i))}>
                    ✕
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {errors["steps"] && <p className="field-error">{errors["steps"]}</p>}
      <button
        type="button"
        className="button button--quiet"
        disabled={mission.steps.length >= MAX_STEPS}
        onClick={() => onChange(addStep(mission), [...keys, nextKey.current++])}
      >
        + Add a step
      </button>

      <Field id="m-finale" label="Last line, said at the end" error={errors["finale"]}>
        <textarea
          id="m-finale"
          className="input input--grow"
          rows={1}
          value={mission.finale}
          onChange={(e) => edit(updateText(mission, "finale", e.target.value), "finale")}
        />
      </Field>
      <Field id="m-leave" label="Time to leave (optional)" error={errors["leave_at"]} className="field--short">
        <input
          id="m-leave"
          className="input"
          type="time"
          value={mission.leave_at ?? ""}
          aria-describedby="m-leave-hint"
          onChange={(e) => edit({ ...mission, leave_at: e.target.value }, "leave_at")}
        />
        <p className="field-hint" id="m-leave-hint">
          The last screen then says how many minutes are left to play.
        </p>
      </Field>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ id, label, error, hidden, className, children }: FieldProps) {
  return (
    <div className={`field${error ? " field--error" : ""}${className ? ` ${className}` : ""}`}>
      <label htmlFor={id} className={hidden ? "visually-hidden" : "label"}>
        {label}
      </label>
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
