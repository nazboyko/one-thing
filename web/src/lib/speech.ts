// Reads lines aloud with the browser's own speech engine. A local English
// voice is preferred. Nothing here ever throws: without speech the screen
// still works, it is just silent.

export interface VoiceLike {
  lang: string;
  localService: boolean;
}

/** First English voice, preferring one that runs on the device. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  return english.find((v) => v.localService) ?? english[0] ?? null;
}

const RATE = 0.9;
let voice: SpeechSynthesisVoice | null = null;

function engine(): SpeechSynthesis | null {
  try {
    return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

function refreshVoice(): void {
  try {
    voice = pickVoice(engine()?.getVoices() ?? []);
  } catch {
    voice = null;
  }
}

// Safari and Chrome load voices late and announce them with this event.
try {
  refreshVoice();
  engine()?.addEventListener("voiceschanged", refreshVoice);
} catch {
  // no speech on this device
}

export interface SpeakOptions {
  /** Stop whatever is being said first. Default true. */
  interrupt?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  const synth = engine();
  if (!synth || !text.trim()) {
    opts.onEnd?.();
    return;
  }
  let finished = false;
  let fallback = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(fallback);
    opts.onEnd?.();
  };
  try {
    if (opts.interrupt !== false) synth.cancel();
    if (!voice) refreshVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = RATE;
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = "en-US";
    }
    u.onstart = () => opts.onStart?.();
    u.onend = finish;
    u.onerror = finish;
    // Some engines never fire "end"; do not leave the speaking ring on.
    fallback = window.setTimeout(finish, 3000 + text.length * 120);
    synth.speak(u);
  } catch {
    finish();
  }
}

export function stopSpeaking(): void {
  try {
    engine()?.cancel();
  } catch {
    // nothing to stop
  }
}
