import { useCallback, useEffect, useRef, useState } from "react";
import { LaunchButton } from "../components/LaunchButton";
import { api, ApiError, type Mission, type Step } from "../lib/api";
import { chime, unlockAudio } from "../lib/chime";
import { speak, stopSpeaking } from "../lib/speech";
import { formatClock, remainingMs } from "../lib/timer";
import "../styles/kid.css";

const CHECK_MS = 600;
const HATCH_MS = 3000;
const NUDGE_LINE = "Still on it? Hold the button when you're done.";
const TIME_UP_LINE = "Time's up. Great job.";

type View =
  | { kind: "loading" }
  | { kind: "missing"; offline: boolean }
  | { kind: "intro" }
  | { kind: "step"; index: number }
  | { kind: "finale" };

interface Props {
  id: string;
  speed: number;
}

export function Play({ id, speed }: Props) {
  const [mission, setMission] = useState<Mission | null>(null);
  const [view, setView] = useState<View>({ kind: "loading" });

  useKidScreen();
  useWakeLock();

  useEffect(() => {
    let live = true;
    setView({ kind: "loading" });
    const load = id === "sample" ? api.sample() : api.get(id);
    load.then(
      (m) => {
        if (!live) return;
        setMission(m);
        document.title = m.title;
        setView({ kind: "intro" });
      },
      (e: unknown) => {
        if (live) setView({ kind: "missing", offline: !(e instanceof ApiError) || e.status === 0 });
      },
    );
    return () => {
      live = false;
      stopSpeaking();
    };
  }, [id]);

  const start = () => {
    if (!mission) return;
    unlockAudio();
    speak(mission.intro);
    setView({ kind: "step", index: 0 });
  };

  const advance = useCallback(
    (index: number) => {
      if (!mission) return;
      setView(index + 1 < mission.steps.length ? { kind: "step", index: index + 1 } : { kind: "finale" });
    },
    [mission],
  );

  useEffect(() => {
    if (view.kind === "finale" && mission) speak(mission.finale);
  }, [view.kind, mission]);

  return (
    <div className="kid" onContextMenu={(e) => e.preventDefault()}>
      <EscapeHatch />
      {view.kind === "loading" && <div className="kid__center" aria-busy="true" />}
      {view.kind === "missing" && <Missing offline={view.offline} />}
      {mission && view.kind === "intro" && <Intro mission={mission} onStart={start} />}
      {mission && view.kind === "step" && (
        <StepView
          key={view.index}
          step={mission.steps[view.index]}
          index={view.index}
          total={mission.steps.length}
          speed={speed}
          queueSpeech={view.index === 0}
          onDone={advance}
        />
      )}
      {mission && view.kind === "finale" && <Finale mission={mission} />}
    </div>
  );
}

function Intro({ mission, onStart }: { mission: Mission; onStart: () => void }) {
  return (
    <main className="kid__intro">
      <FlightPath total={mission.steps.length} current={-1} done={0} />
      <div className="kid__intro-body">
        <span className="kid__intro-rocket" aria-hidden="true">
          🚀
        </span>
        <h1 className="kid__title">{mission.title}</h1>
        <p className="kid__line">{mission.intro}</p>
      </div>
      <button type="button" className="kid__start" onClick={onStart}>
        Start
      </button>
    </main>
  );
}

interface StepProps {
  step: Step;
  index: number;
  total: number;
  speed: number;
  queueSpeech: boolean;
  onDone: (index: number) => void;
}

function StepView({ step, index, total, speed, queueSpeech, onDone }: StepProps) {
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [speaking, setSpeaking] = useState(false);
  const [finished, setFinished] = useState(false);
  const speechToken = useRef(0);
  const timeUpHandled = useRef(false);

  const say = useCallback((text: string, interrupt: boolean) => {
    const token = ++speechToken.current;
    speak(text, {
      interrupt,
      onStart: () => token === speechToken.current && setSpeaking(true),
      onEnd: () => token === speechToken.current && setSpeaking(false),
    });
  }, []);

  useEffect(() => {
    say(step.say, !queueSpeech);
  }, [say, step.say, queueSpeech]);

  const left = remainingMs(startedAt.current, now, step.seconds, speed);
  const timeUp = left === 0;
  const waiting = step.mode === "for_duration" && !timeUp;

  useEffect(() => {
    if (timeUp || finished) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [timeUp, finished]);

  useEffect(() => {
    if (!timeUp || timeUpHandled.current || finished) return;
    timeUpHandled.current = true;
    if (step.mode === "for_duration") {
      chime("done");
      say(TIME_UP_LINE, false);
    } else {
      chime("nudge");
      say(NUDGE_LINE, false);
    }
  }, [timeUp, finished, step.mode, say]);

  const fire = useCallback(() => {
    setFinished(true);
    try {
      navigator.vibrate?.(40);
    } catch {
      // no vibration on this device
    }
  }, []);

  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => onDone(index), CHECK_MS);
    return () => window.clearTimeout(t);
  }, [finished, index, onDone]);

  return (
    <main className={`kid__step kid__step--${step.mode}`}>
      <FlightPath total={total} current={index} done={finished ? index + 1 : index} />
      <button
        type="button"
        className={`kid__emoji${speaking ? " is-speaking" : ""}`}
        onClick={() => say(step.say, true)}
        aria-label={`Say it again: ${step.say}`}
      >
        <span aria-hidden="true">{step.emoji}</span>
      </button>
      <div className="kid__controls">
        <h1 className="kid__title">{step.title}</h1>
        <p className={`kid__timer${timeUp ? " is-up" : ""}`} aria-hidden="true">
          {formatClock(left)}
        </p>
        <LaunchButton disabled={waiting} onFire={fire} />
      </div>
    </main>
  );
}

function Finale({ mission }: { mission: Mission }) {
  return (
    <main className="kid__finale">
      <FlightPath total={mission.steps.length} current={-1} done={mission.steps.length} />
      <div className="kid__finale-body">
        <span className="kid__liftoff" aria-hidden="true">
          🚀
        </span>
        <h1 className="kid__title">Mission complete</h1>
        <p className="kid__line">{mission.finale}</p>
      </div>
    </main>
  );
}

function Missing({ offline }: { offline: boolean }) {
  return (
    <main className="kid__center">
      <span className="kid__intro-rocket" aria-hidden="true">
        🛰️
      </span>
      <h1 className="kid__title">{offline ? "Can't reach the mission" : "This mission is not here"}</h1>
      <p className="kid__line">Ask a grown-up to check the laptop.</p>
    </main>
  );
}

// Dots for every step: done, the rocket on the current one, still to go.
// The end is always visible, so the routine feels finite.
function FlightPath({ total, current, done }: { total: number; current: number; done: number }) {
  return (
    <ol className="flight" aria-label={`Step ${Math.min(done + 1, total)} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const state = i < done ? "done" : i === current ? "current" : "ahead";
        return (
          <li key={i} className={`flight__dot flight__dot--${state}`}>
            {state === "current" && <span aria-hidden="true">🚀</span>}
          </li>
        );
      })}
    </ol>
  );
}

// Press and hold the top-left corner for three seconds to get back to the
// parent screen. Invisible to the child.
function EscapeHatch() {
  const timer = useRef(0);
  const cancel = () => window.clearTimeout(timer.current);
  useEffect(() => cancel, []);
  return (
    <div
      className="kid__hatch"
      aria-hidden="true"
      onPointerDown={() => {
        cancel();
        timer.current = window.setTimeout(() => {
          stopSpeaking();
          location.hash = "#/";
        }, HATCH_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

function useKidScreen() {
  useEffect(() => {
    document.body.dataset.screen = "kid";
    return () => {
      delete document.body.dataset.screen;
    };
  }, []);
}

// Keeps the screen awake where the browser allows it. On a plain-HTTP home
// network address it usually does not; the README covers Auto-Lock.
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) {
          lock = await navigator.wakeLock.request("screen");
        }
      } catch {
        lock = null;
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      document.removeEventListener("visibilitychange", request);
      lock?.release().catch(() => undefined);
    };
  }, []);
}
