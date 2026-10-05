// Reads lines aloud with the browser's own speech engine, using only voices
// that are installed on the device. Nothing here ever throws: without speech
// the screen still works, it is just silent.

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  voiceURI?: string;
}

// Natural-sounding English voices on Apple devices, best first.
const NATURAL = ["ava", "zoe", "samantha", "allison", "susan", "evan", "tom", "daniel", "karen", "moira", "tessa"];

// Novelty and robotic macOS voices. Never used, even when nothing else is there.
const NEVER = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "good news",
  "jester",
  "organ",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
  "fred",
  "junior",
  "ralph",
  "kathy",
  "princess",
  "eddy",
  "flo",
  "grandma",
  "grandpa",
  "reed",
  "rocko",
  "sandy",
  "shelley",
]);

function isEnglish(lang: string): boolean {
  return /^en([-_]|$)/i.test(lang);
}

/** "Ava (Premium)" -> "ava", "Eddy (English (US))" -> "eddy". */
function baseName(name: string): string {
  return name.split("(")[0].trim().toLowerCase();
}

/** A stable id for a voice. Safari repeats names, so the URI comes first. */
export function voiceKey(v: VoiceLike): string {
  return v.voiceURI || v.name;
}

// Lower is better: quality, then compactness, then the place in NATURAL.
function score(v: VoiceLike): [number, number, number] {
  // Chrome puts the quality in the name ("Zoe (Premium)"), Safari in the URI
  // ("com.apple.voice.premium.en-US.Zoe").
  const label = `${v.name} ${v.voiceURI ?? ""}`.toLowerCase();
  const known = NATURAL.indexOf(baseName(v.name));
  const quality = label.includes("premium") ? 0 : label.includes("enhanced") ? 1 : known >= 0 ? 2 : 3;
  return [quality, label.includes("super-compact") ? 1 : 0, known >= 0 ? known : NATURAL.length];
}

/**
 * The voices this app may use, best first: local English voices only, never
 * a network voice and never a novelty one. Premium voices come first, then
 * Enhanced, then the known natural ones, then any other.
 */
export function rankVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  const ranked = voices
    .filter((v) => v.localService && isEnglish(v.lang) && !NEVER.has(baseName(v.name)))
    .map((voice, order) => ({ voice, order, score: score(voice) }))
    .sort((a, b) => a.score[0] - b.score[0] || a.score[1] - b.score[1] || a.score[2] - b.score[2] || a.order - b.order)
    .map((entry) => entry.voice);

  // Safari lists one voice several times (compact, super-compact). Keep the best.
  const seen = new Set<string>();
  return ranked.filter((v) => {
    const id = `${v.name}|${v.lang.replace("_", "-").toLowerCase()}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** The parent's choice when this device has it, otherwise the best voice. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], chosen?: string | null): T | null {
  const ranked = rankVoices(voices);
  return ranked.find((v) => voiceKey(v) === chosen) ?? ranked[0] ?? null;
}

const RATE = 0.95;
const PITCH = 1;
const CHOICE_KEY = "one-thing.voice";

export const TEST_LINE = "Captain, your rocket leaves soon.";

function engine(): SpeechSynthesis | null {
  try {
    return (typeof window !== "undefined" && window.speechSynthesis) || null;
  } catch {
    return null;
  }
}

function installed(): SpeechSynthesisVoice[] {
  try {
    return engine()?.getVoices() ?? [];
  } catch {
    return [];
  }
}

// Chrome loads its voices in the background; asking early starts that.
installed();

/** The voice the parent chose on this device, or null for the automatic pick. */
export function getVoiceChoice(): string | null {
  try {
    return localStorage.getItem(CHOICE_KEY);
  } catch {
    return null;
  }
}

export function setVoiceChoice(key: string | null): void {
  try {
    if (key) localStorage.setItem(CHOICE_KEY, key);
    else localStorage.removeItem(CHOICE_KEY);
  } catch {
    // no storage here: the automatic pick stays
  }
}

export interface VoiceList {
  /** False when this browser cannot speak at all. */
  supported: boolean;
  /** How many voices the browser reports, usable or not. */
  reported: number;
  /** The voices this app may use, best first. */
  usable: SpeechSynthesisVoice[];
}

function readVoices(): VoiceList {
  const all = installed();
  return { supported: engine() !== null, reported: all.length, usable: rankVoices(all) };
}

/** Calls back now and again whenever the browser's voice list changes. */
export function watchVoices(onChange: (list: VoiceList) => void): () => void {
  const update = () => onChange(readVoices());
  const synth = engine();
  update();
  try {
    synth?.addEventListener("voiceschanged", update);
  } catch {
    // an old engine without events: the second look below covers it
  }
  // Safari does not always announce its voices, so look once more.
  const later = window.setTimeout(update, 1000);
  return () => {
    window.clearTimeout(later);
    try {
      synth?.removeEventListener("voiceschanged", update);
    } catch {
      // nothing to remove
    }
  };
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
    const all = installed();
    const voice = pickVoice(all, getVoiceChoice());
    // The device lists its voices and none is a usable local English one:
    // stay silent rather than fall back to a network or novelty voice.
    if (!voice && all.length > 0) {
      finish();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = RATE;
    u.pitch = PITCH;
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
