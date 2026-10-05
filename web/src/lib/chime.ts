// Two-note chimes made with WebAudio, so there are no audio files to load.
// Mobile browsers only allow sound after a tap, so unlockAudio() runs on the
// Start tap.

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

const NOTES = {
  // a soft "are you there?" going up a fourth
  nudge: [587.33, 783.99],
  // a brighter "done" going up a fifth
  done: [659.25, 987.77],
} as const;

export function chime(kind: keyof typeof NOTES): void {
  try {
    if (!ctx) unlockAudio();
    const audio = ctx;
    if (!audio) return;
    const start = audio.currentTime + 0.02;
    NOTES[kind].forEach((freq, i) => {
      const t = start + i * 0.2;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  } catch {
    // silent device: the screen still works
  }
}
