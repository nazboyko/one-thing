import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createHold, isMoving, press, progress, release, setDisabled, tick, type Hold } from "../lib/hold";

interface Props {
  disabled: boolean;
  onFire: () => void;
}

// The signature element: a round button that fires only after an 800 ms
// hold. An amber ring fills while it is held and drains when let go early.
export function LaunchButton({ disabled, onFire }: Props) {
  const hold = useRef<Hold>(createHold(disabled));
  const ring = useRef<SVGCircleElement>(null);
  const frame = useRef(0);
  const fireRef = useRef(onFire);
  const [pressed, setPressed] = useState(false);
  const [fired, setFired] = useState(false);
  fireRef.current = onFire;

  const draw = useCallback((now: number) => {
    // A dash as long as the progress: zero draws nothing at all.
    ring.current?.style.setProperty("stroke-dasharray", `${progress(hold.current, now)} 1`);
  }, []);

  const loop = useCallback(() => {
    const now = performance.now();
    const r = tick(hold.current, now);
    hold.current = r.hold;
    draw(now);
    if (r.fired) {
      frame.current = 0;
      setPressed(false);
      setFired(true);
      fireRef.current();
      return;
    }
    frame.current = isMoving(r.hold, now) ? requestAnimationFrame(loop) : 0;
  }, [draw]);

  const kick = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => {
    hold.current = setDisabled(hold.current, disabled, performance.now());
    if (disabled) setPressed(false);
    kick();
  }, [disabled, kick]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const down = () => {
    const next = press(hold.current, performance.now());
    if (next === hold.current) return;
    hold.current = next;
    setPressed(true);
    kick();
  };
  const up = () => {
    hold.current = release(hold.current, performance.now());
    setPressed(false);
    kick();
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety; the hold still works without it
    }
    down();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (!e.repeat) down();
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    up();
  };

  const state = fired ? "fired" : disabled ? "waiting" : pressed ? "pressed" : "ready";

  return (
    <div className={`launch launch--${state}`}>
      <svg className="launch__ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="launch__track" cx="50" cy="50" r="45" pathLength={1} />
        <circle ref={ring} className="launch__fill" cx="50" cy="50" r="45" pathLength={1} />
      </svg>
      <button
        type="button"
        className="launch__button"
        aria-disabled={disabled || fired}
        onPointerDown={onPointerDown}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {fired ? <span className="launch__check" aria-hidden="true">✓</span> : "Hold when done"}
        {fired && <span className="visually-hidden">Done</span>}
      </button>
    </div>
  );
}
