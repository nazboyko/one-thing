import { useCallback, useEffect, useRef, useState } from "react";
import { Field, MissionEditor } from "../components/MissionEditor";
import { VoicePicker } from "../components/VoicePicker";
import { api, ApiError, type Health, type Meta, type Mission } from "../lib/api";
import { parseFieldErrors, toDraft } from "../lib/editor";
import { playLinks } from "../lib/links";
import { playHash } from "../lib/route";
import "../styles/parent.css";

type Source = { kind: "model"; meta: Meta } | { kind: "sample" } | { kind: "saved"; id: string };

interface Draft {
  mission: Mission;
  keys: number[];
  source: Source;
}

const DEFAULT_THEME = "rocket launch";

function newDraft(m: Mission, source: Source): Draft {
  return { mission: toDraft(m), keys: m.steps.map((_, i) => i + 1), source };
}

export function Parent() {
  const [health, setHealth] = useState<Health | null>(null);
  const [routine, setRoutine] = useState("");
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [writingSince, setWritingSince] = useState<number | null>(null);
  const [writeError, setWriteError] = useState<{ message: string; details: string[] } | null>(null);
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Mission[] | null>(null);
  const [notice, setNotice] = useState("");
  const reviewRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = "One Thing";
  }, []);

  const refreshHealth = useCallback(() => {
    api.health().then(setHealth, () => setHealth(null));
  }, []);

  const refreshList = useCallback(() => {
    api.list().then(setSaved, () => setSaved([]));
  }, []);

  useEffect(() => {
    refreshHealth();
    refreshList();
  }, [refreshHealth, refreshList]);

  // Wi-Fi going on or off changes the tablet link. The laptop link stays.
  useEffect(() => {
    window.addEventListener("online", refreshHealth);
    window.addEventListener("offline", refreshHealth);
    return () => {
      window.removeEventListener("online", refreshHealth);
      window.removeEventListener("offline", refreshHealth);
    };
  }, [refreshHealth]);

  // While the model is down, check again now and then, so the banner goes
  // away by itself once Ollama runs.
  const modelUp = health?.ollama === "up";
  useEffect(() => {
    if (modelUp) return;
    const t = window.setInterval(refreshHealth, 5000);
    return () => window.clearInterval(t);
  }, [modelUp, refreshHealth]);

  const showReview = () => window.requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const write = async () => {
    setWriteError(null);
    setInputErrors({});
    setNotice("");
    setWritingSince(Date.now());
    try {
      const out = await api.generate(routine, theme);
      setDraft(newDraft(out.mission, { kind: "model", meta: out.meta }));
      setDraftErrors({});
      setSaveError("");
      showReview();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "Something went wrong.");
      const fields = parseFieldErrors(err.fields);
      if (fields["routine"] || fields["theme"]) {
        setInputErrors(fields);
      } else {
        setWriteError({ message: err.message, details: err.fields });
      }
      if (err.status === 502) refreshHealth();
    } finally {
      setWritingSince(null);
    }
  };

  const useSample = async () => {
    setNotice("");
    try {
      setDraft(newDraft(await api.sample(), { kind: "sample" }));
      setDraftErrors({});
      setSaveError("");
      showReview();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not load the sample.");
    }
  };

  const approve = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError("");
    try {
      const m =
        draft.source.kind === "saved" ? await api.replace(draft.source.id, draft.mission) : await api.create(draft.mission);
      setDraft(null);
      setDraftErrors({});
      setNotice(`Approved and saved: ${m.title}`);
      refreshList();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "Could not save.");
      setDraftErrors(parseFieldErrors(err.fields));
      setSaveError(err.fields.length ? "Some fields need a fix before saving. They are marked above." : err.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (m: Mission) => {
    if (!m.id) return;
    setNotice("");
    setDraft(newDraft(m, { kind: "saved", id: m.id }));
    setDraftErrors({});
    setSaveError("");
    showReview();
  };

  const remove = async (m: Mission) => {
    if (!m.id || !window.confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
    try {
      await api.remove(m.id);
      if (draft?.source.kind === "saved" && draft.source.id === m.id) setDraft(null);
      setNotice(`Deleted: ${m.title}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not delete.");
    }
    refreshList();
  };

  const writing = writingSince !== null;

  return (
    <div className="parent">
      <header className="p-head">
        <div>
          <h1 className="p-title">One Thing</h1>
          <p className="p-tagline">A mission board that shows a kid one step at a time.</p>
        </div>
        <ModelStatus health={health} />
      </header>

      <main>
        <section className="p-section" aria-labelledby="s1">
          <h2 id="s1" className="p-heading">
            <span className="p-num" aria-hidden="true">1</span>
            Describe the routine
          </h2>
          {health && health.ollama !== "up" && <ModelDown health={health} onSample={useSample} />}
          <form
            className="p-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!writing) void write();
            }}
          >
            <Field id="routine" label="The routine, in your own words" error={inputErrors["routine"]}>
              <textarea
                id="routine"
                className="input input--area"
                rows={4}
                maxLength={500}
                value={routine}
                placeholder="School morning: breakfast, brush teeth, get dressed, shoes and jacket, backpack. Brushing teeth is the hardest part, split it into short pieces."
                onChange={(e) => setRoutine(e.target.value)}
              />
            </Field>
            <div className="p-row">
              <Field id="theme" label="Theme" error={inputErrors["theme"]} className="p-theme">
                <input id="theme" className="input" maxLength={60} value={theme} onChange={(e) => setTheme(e.target.value)} />
              </Field>
              <button type="submit" className="button button--primary" disabled={writing} aria-busy={writing}>
                {writing ? <WritingLabel since={writingSince} /> : "Write the mission"}
              </button>
            </div>
            {writeError && (
              <div className="p-problem" role="alert">
                <p>{writeError.message}</p>
                {writeError.details.length > 0 && (
                  <ul>
                    {writeError.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </form>
        </section>

        <section className="p-section" aria-labelledby="s2" ref={reviewRef}>
          <h2 id="s2" className="p-heading">
            <span className="p-num" aria-hidden="true">2</span>
            Read every step before your kid does
          </h2>
          <div className="p-card">
            {writing && <p className="p-quiet">Gemma is writing the mission on this laptop.</p>}
            {!writing && !draft && (
              <p className="p-quiet">Write a mission above. It shows up here, so you can read and fix every step before your kid sees it.</p>
            )}
            {!writing && draft && (
              <>
                <MissionEditor
                  mission={draft.mission}
                  keys={draft.keys}
                  errors={draftErrors}
                  onChange={(mission, keys, changed) => {
                    setDraft({ ...draft, mission, keys });
                    if (changed && draftErrors[changed]) {
                      const rest = { ...draftErrors };
                      delete rest[changed];
                      setDraftErrors(rest);
                    } else if (!changed) {
                      setDraftErrors({});
                    }
                  }}
                />
                <div className="p-row p-row--end">
                  <SourceLine source={draft.source} />
                  <div className="p-actions">
                    <button type="button" className="button button--quiet" onClick={() => setDraft(null)}>
                      Discard
                    </button>
                    <button type="button" className="button button--primary" disabled={saving} onClick={approve}>
                      Approve and save
                    </button>
                  </div>
                </div>
                {saveError && (
                  <p className="p-problem" role="alert">
                    {saveError}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <section className="p-section" aria-labelledby="s3">
          <h2 id="s3" className="p-heading">
            <span className="p-num" aria-hidden="true">3</span>
            Hand it over
          </h2>
          {notice && (
            <p className="p-notice" role="status">
              {notice}
            </p>
          )}
          <SavedList missions={saved} health={health} onEdit={edit} onDelete={remove} onSample={useSample} />
          <VoicePicker />
        </section>
      </main>

      <footer className="p-foot">
        <p>Runs on this laptop. Missions and the model never leave it.</p>
      </footer>
    </div>
  );
}

function WritingLabel({ since }: { since: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const s = since ? Math.floor((now - since) / 1000) : 0;
  return <>Writing… {s} s</>;
}

function ModelStatus({ health }: { health: Health | null }) {
  if (!health) {
    return (
      <p className="p-model p-model--down" role="status">
        Server not reachable
      </p>
    );
  }
  const up = health.ollama === "up";
  return (
    <p className={`p-model ${up ? "p-model--up" : "p-model--down"}`} role="status">
      {up ? `Model ready: ${health.model}` : health.ollama === "missing" ? `Model not downloaded: ${health.model}` : "Model is not running"}
    </p>
  );
}

function ModelDown({ health, onSample }: { health: Health; onSample: () => void }) {
  const command = health.ollama === "missing" ? `ollama pull ${health.model}` : "ollama serve";
  return (
    <div className="p-banner" role="alert">
      <p>
        <strong>{health.ollama === "missing" ? `The model ${health.model} is not downloaded.` : "The model is not running."}</strong>{" "}
        Start it with <code>{command}</code>, then write the mission. Until then, the built-in sample mission works.
      </p>
      <button type="button" className="button button--secondary" onClick={onSample}>
        Use the sample mission
      </button>
    </div>
  );
}

function SourceLine({ source }: { source: Source }) {
  if (source.kind === "model") {
    const { model, ms, attempts } = source.meta;
    return (
      <p className="p-meta">
        Written by {model} on this laptop in {(ms / 1000).toFixed(1)} s, {attempts} {attempts === 1 ? "attempt" : "attempts"}.
      </p>
    );
  }
  if (source.kind === "sample") return <p className="p-meta">The built-in sample mission. Change anything you like.</p>;
  return <p className="p-meta">Editing a saved mission. Approving replaces it.</p>;
}

interface SavedListProps {
  missions: Mission[] | null;
  health: Health | null;
  onEdit: (m: Mission) => void;
  onDelete: (m: Mission) => void;
  onSample: () => void;
}

function SavedList({ missions, health, onEdit, onDelete, onSample }: SavedListProps) {
  if (missions === null) return null;
  if (missions.length === 0) {
    return (
      <div className="p-card p-empty">
        <p>No missions yet. Write one above, or try the sample.</p>
        <button type="button" className="button button--primary" onClick={onSample}>
          Use the sample mission
        </button>
      </div>
    );
  }
  return (
    <ul className="saved">
      {missions.map((m) => (
        <li key={m.id} className="p-card saved__item">
          <div className="saved__head">
            <p className="saved__title">{m.title}</p>
            <p className="saved__steps">
              {m.steps.length} steps: {m.steps.map((s) => s.emoji).join(" ")}
            </p>
          </div>
          <div className="saved__actions">
            <a className="button button--secondary" href={playHash(m.id!)}>
              Play here
            </a>
            <button type="button" className="button button--quiet" onClick={() => onEdit(m)}>
              Edit
            </button>
            <button type="button" className="button button--quiet" onClick={() => onDelete(m)} aria-label={`Delete ${m.title}`}>
              Delete
            </button>
          </div>
          <HandOverLinks mission={m} health={health} />
        </li>
      ))}
    </ul>
  );
}

// Two ways to open a saved mission. The laptop link works with Wi-Fi off;
// the tablet link needs the laptop's address in the home network.
function HandOverLinks({ mission, health }: { mission: Mission; health: Health | null }) {
  const links = playLinks(mission.id!, health?.lan_urls ?? [], location);
  return (
    <div className="saved__links">
      <PlayLink id={`laptop-${mission.id}`} label="On this laptop" url={links.laptop} title={mission.title} />
      {links.tablet ? (
        <PlayLink id={`tablet-${mission.id}`} label="On a tablet" url={links.tablet} title={mission.title} />
      ) : (
        <div className="saved__link">
          <span className="saved__link-label">On a tablet</span>
          <p className="saved__link-note">
            {health
              ? "This laptop has no home network address right now. Connect it to Wi-Fi, then reload."
              : "Checking the network…"}
          </p>
        </div>
      )}
    </div>
  );
}

interface PlayLinkProps {
  id: string;
  label: string;
  url: string;
  title: string;
}

function PlayLink({ id, label, url, title }: PlayLinkProps) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // plain-HTTP pages may not have the clipboard API; select the text instead
      field.current?.select();
      try {
        document.execCommand("copy");
      } catch {
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  const action = copied ? "Copied" : "Copy link";
  return (
    <div className="saved__link">
      <label className="saved__link-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} ref={field} className="input input--link" readOnly value={url} onFocus={(e) => e.target.select()} />
      <button type="button" className="button button--quiet" onClick={copy} aria-label={`${action}, ${label.toLowerCase()}, ${title}`}>
        {action}
      </button>
    </div>
  );
}
