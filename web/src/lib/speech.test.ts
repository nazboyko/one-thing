import { afterEach, describe, expect, it, vi } from "vitest";
import { getVoiceChoice, pickVoice, rankVoices, setVoiceChoice, speak, voiceKey, type VoiceLike } from "./speech";

const local = (name: string, lang = "en-US", voiceURI?: string): VoiceLike => ({ name, lang, localService: true, voiceURI });
const network = (name: string, lang = "en-US"): VoiceLike => ({ name, lang, localService: false });
const names = (voices: VoiceLike[]) => voices.map((v) => v.name);

// The novelty and robotic macOS voices, written out again here so a typo in
// the real list fails a test.
const NEVER = [
  "Albert",
  "Bad News",
  "Bahh",
  "Bells",
  "Boing",
  "Bubbles",
  "Cellos",
  "Good News",
  "Jester",
  "Organ",
  "Superstar",
  "Trinoids",
  "Whisper",
  "Wobble",
  "Zarvox",
  "Fred",
  "Junior",
  "Ralph",
  "Kathy",
  "Princess",
  "Eddy",
  "Flo",
  "Grandma",
  "Grandpa",
  "Reed",
  "Rocko",
  "Sandy",
  "Shelley",
];

describe("rankVoices", () => {
  it("puts Premium first, then Enhanced, then known natural voices, then the rest", () => {
    // roughly what Chrome reports on a Mac, in a jumbled order
    const voices = [
      network("Google US English"),
      local("Albert"),
      local("Daniel", "en-GB"),
      local("Zoe (Enhanced)"),
      local("Karen", "en-AU"),
      local("Fred"),
      local("Samantha"),
      local("Ava (Premium)"),
      local("Microsoft David - English (United States)"),
      local("Tessa", "en-ZA"),
      local("Rishi", "en-IN"),
      local("Anna", "de-DE"),
    ];
    expect(names(rankVoices(voices))).toEqual([
      "Ava (Premium)",
      "Zoe (Enhanced)",
      "Samantha",
      "Daniel",
      "Karen",
      "Tessa",
      "Microsoft David - English (United States)",
      "Rishi",
    ]);
  });

  it("orders the known natural voices the same way whatever the browser's order", () => {
    const known = ["Ava", "Zoe", "Samantha", "Allison", "Susan", "Evan", "Tom", "Daniel", "Karen", "Moira", "Tessa"];
    expect(names(rankVoices([...known].reverse().map((n) => local(n))))).toEqual(known);
  });

  it("puts any Premium voice above any Enhanced one", () => {
    const voices = [local("Ava (Enhanced)"), local("Tessa (Premium)", "en-ZA"), local("Zoe (Premium)")];
    expect(names(rankVoices(voices))).toEqual(["Zoe (Premium)", "Tessa (Premium)", "Ava (Enhanced)"]);
  });

  it("never uses a network voice, even when nothing else is there", () => {
    const voices = [network("Google US English"), network("Google UK English Female", "en-GB")];
    expect(rankVoices(voices)).toEqual([]);
    expect(pickVoice(voices)).toBeNull();
  });

  it.each(NEVER)("never uses the novelty voice %s", (name) => {
    expect(rankVoices([local(name)])).toEqual([]);
    expect(rankVoices([local(`${name} (English (US))`), local(`${name} (English (UK))`, "en-GB")])).toEqual([]);
    expect(names(rankVoices([local(name), local("Samantha")]))).toEqual(["Samantha"]);
  });

  it("matches whole names, not parts of them", () => {
    // "Tomas" is not Tom and "Freddie" is not Fred
    expect(names(rankVoices([local("Freddie"), local("Tomas"), local("Tom")]))).toEqual(["Tom", "Freddie", "Tomas"]);
  });

  it("keeps only English voices, with either kind of language code", () => {
    const voices = [local("Anna", "de-DE"), local("English United States", "en_US"), local("Elena", "el-GR"), local("Plain", "en")];
    expect(names(rankVoices(voices))).toEqual(["English United States", "Plain"]);
  });

  it("reads Premium and Enhanced from the voice URI, as Safari reports them", () => {
    const voices = [
      local("Ava", "en-US", "com.apple.voice.compact.en-US.Ava"),
      local("Samantha", "en-US", "com.apple.voice.enhanced.en-US.Samantha"),
      local("Zoe", "en-US", "com.apple.voice.premium.en-US.Zoe"),
    ];
    expect(names(rankVoices(voices))).toEqual(["Zoe", "Samantha", "Ava"]);
  });

  it("lists a repeated voice once and prefers compact over super-compact", () => {
    // exactly how WebKit reports Samantha and Daniel on a Mac
    const voices = [
      local("Samantha", "en-US", "com.apple.voice.super-compact.en-US.Samantha"),
      local("Samantha", "en-US", "com.apple.voice.compact.en-US.Samantha"),
      local("Albert", "en-US", "com.apple.speech.synthesis.voice.Albert"),
      local("Daniel", "en-GB", "com.apple.voice.super-compact.en-GB.Daniel"),
    ];
    expect(rankVoices(voices).map(voiceKey)).toEqual([
      "com.apple.voice.compact.en-US.Samantha",
      "com.apple.voice.super-compact.en-GB.Daniel",
    ]);
  });

  it("does not change the list it is given", () => {
    const voices = [local("Tessa", "en-ZA"), local("Ava (Premium)")];
    rankVoices(voices);
    expect(names(voices)).toEqual(["Tessa", "Ava (Premium)"]);
  });
});

describe("pickVoice", () => {
  const voices = [local("Albert"), network("Google US English"), local("Samantha"), local("Daniel", "en-GB"), local("Zoe (Premium)")];

  it("picks the best voice by itself", () => {
    expect(pickVoice(voices)?.name).toBe("Zoe (Premium)");
    expect(pickVoice(voices, null)?.name).toBe("Zoe (Premium)");
  });

  it("uses the parent's choice when this device has it", () => {
    expect(pickVoice(voices, "Daniel")?.name).toBe("Daniel");
  });

  it("finds a chosen voice by its URI", () => {
    const safari = [local("Samantha", "en-US", "com.apple.voice.compact.en-US.Samantha"), local("Karen", "en-AU", "com.apple.voice.compact.en-AU.Karen")];
    expect(pickVoice(safari, "com.apple.voice.compact.en-AU.Karen")?.name).toBe("Karen");
  });

  it("falls back to the best voice when the choice is not on this device", () => {
    expect(pickVoice(voices, "Moira")?.name).toBe("Zoe (Premium)");
  });

  it("ignores a choice that points at a novelty or network voice", () => {
    expect(pickVoice(voices, "Albert")?.name).toBe("Zoe (Premium)");
    expect(pickVoice(voices, "Google US English")?.name).toBe("Zoe (Premium)");
  });

  it("is null when the device has no usable voice", () => {
    expect(pickVoice([])).toBeNull();
    expect(pickVoice([local("Fred"), local("Anna", "de-DE"), network("Google US English")])).toBeNull();
  });
});

describe("speak without a speech engine", () => {
  it("does not throw and still reports the end", () => {
    let ended = false;
    expect(() => speak("Hello, Captain.", { onEnd: () => (ended = true) })).not.toThrow();
    expect(ended).toBe(true);
  });
});

describe("the saved voice choice", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is kept in localStorage and cleared by null", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    expect(getVoiceChoice()).toBeNull();
    setVoiceChoice("Samantha");
    expect(getVoiceChoice()).toBe("Samantha");
    setVoiceChoice(null);
    expect(getVoiceChoice()).toBeNull();
    expect(store.size).toBe(0);
  });

  it("never throws when storage is blocked", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(() => setVoiceChoice("Samantha")).not.toThrow();
    expect(() => setVoiceChoice(null)).not.toThrow();
    expect(getVoiceChoice()).toBeNull();
  });
});
