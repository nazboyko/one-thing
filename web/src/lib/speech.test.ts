import { describe, expect, it } from "vitest";
import { pickVoice, speak } from "./speech";

const v = (name: string, lang: string, localService: boolean) => ({ name, lang, localService });

describe("pickVoice", () => {
  it("prefers a local English voice", () => {
    const voices = [v("remote", "en-US", false), v("german", "de-DE", true), v("local", "en-GB", true)];
    expect(pickVoice(voices)?.name).toBe("local");
  });

  it("falls back to the first English voice", () => {
    expect(pickVoice([v("fr", "fr-FR", true), v("us", "en-US", false)])?.name).toBe("us");
  });

  it("accepts underscore and bare language codes", () => {
    expect(pickVoice([v("android", "en_US", true)])?.name).toBe("android");
    expect(pickVoice([v("bare", "en", true)])?.name).toBe("bare");
  });

  it("does not mistake other languages for English", () => {
    expect(pickVoice([v("greek", "el-GR", true)])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});

describe("speak without a speech engine", () => {
  it("does not throw and still reports the end", () => {
    let ended = false;
    expect(() => speak("Hello, Captain.", { onEnd: () => (ended = true) })).not.toThrow();
    expect(ended).toBe(true);
  });
});
