// Typed calls to the Go server. Every error carries the server's message and
// the list of field errors, so the UI can show them under the right input.

export type Mode = "until_done" | "for_duration";

export interface Step {
  emoji: string;
  title: string;
  say: string;
  mode: Mode;
  seconds: number;
}

export interface Mission {
  id?: string;
  created_at?: string;
  title: string;
  intro: string;
  steps: Step[];
  finale: string;
  leave_at?: string;
}

export interface Health {
  ok: boolean;
  model: string;
  ollama: "up" | "down" | "missing";
  lan_urls: string[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly fields: string[];

  constructor(status: number, message: string, fields: string[] = []) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "The One Thing server is not reachable. Is it running?");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.fields ?? []);
  }
  return data as T;
}

export const api = {
  health: () => request<Health>("GET", "/api/health"),
  sample: () => request<Mission>("GET", "/api/sample"),
  list: () => request<Mission[]>("GET", "/api/missions"),
  get: (id: string) => request<Mission>("GET", `/api/missions/${encodeURIComponent(id)}`),
  create: (m: Mission) => request<Mission>("POST", "/api/missions", m),
  replace: (id: string, m: Mission) => request<Mission>("PUT", `/api/missions/${encodeURIComponent(id)}`, m),
  remove: (id: string) => request<void>("DELETE", `/api/missions/${encodeURIComponent(id)}`),
};
