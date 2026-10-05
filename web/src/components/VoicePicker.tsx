import { useEffect, useState } from "react";
import { getVoiceChoice, setVoiceChoice, speak, TEST_LINE, voiceKey, watchVoices, type VoiceList } from "../lib/speech";

// Every device has its own voices, so the choice is kept on this device and
// the kid screen on the same device uses it.
export function VoicePicker() {
  const [list, setList] = useState<VoiceList | null>(null);
  const [choice, setChoice] = useState<string | null>(() => getVoiceChoice());

  useEffect(() => watchVoices(setList), []);

  if (!list) return null;

  const auto = list.usable[0];
  const current = list.usable.find((v) => voiceKey(v) === choice) ?? auto;
  // A browser that does not list its voices still speaks with its default one.
  const canSpeak = list.supported && (current !== undefined || list.reported === 0);

  const choose = (key: string) => {
    // Picking the automatic voice clears the choice, so a better voice
    // installed later is picked up by itself.
    const next = auto && key === voiceKey(auto) ? null : key;
    setVoiceChoice(next);
    setChoice(next);
  };

  return (
    <div className="p-card voice">
      <div className="voice__row">
        {current ? (
          <div className="field voice__field">
            <label className="label" htmlFor="voice">
              Voice
            </label>
            <select id="voice" className="input input--select" value={voiceKey(current)} onChange={(e) => choose(e.target.value)}>
              {list.usable.map((v) => (
                <option key={voiceKey(v)} value={voiceKey(v)}>
                  {v === auto ? "Automatic: " : ""}
                  {v.name}, {v.lang.replace("_", "-")}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="voice__none">
            <strong>Voice.</strong> {noVoiceMessage(list)}
          </p>
        )}
        {canSpeak && (
          <button type="button" className="button button--secondary" onClick={() => speak(TEST_LINE)}>
            Test voice
          </button>
        )}
      </div>
      <p className="field-hint">
        The choice stays on this device; open this page on the tablet to set its voice. For a natural voice on a Mac or
        iPad, download a Premium or Enhanced English voice in Settings &gt; Accessibility &gt; Spoken Content.
      </p>
    </div>
  );
}

function noVoiceMessage(list: VoiceList): string {
  if (!list.supported) return "This browser cannot speak, so the kid screen is silent on this device.";
  if (list.reported === 0) return "This browser does not list its voices. It speaks with its own default voice.";
  return "No English voice is installed on this device, so the kid screen is silent here.";
}
