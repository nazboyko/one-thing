// Hash routes: "#/" is the parent screen, "#/play/<id>" plays a mission.
// "?speed=N" divides every timer by N (tests and the demo video).

export type Route =
  | { page: "parent" }
  | { page: "play"; id: string; speed: number };

const MAX_SPEED = 100;

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const [path, query = ""] = raw.split("?", 2);
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "play" && parts.length === 2 && /^[A-Za-z0-9_-]{1,64}$/.test(parts[1])) {
    return { page: "play", id: parts[1], speed: parseSpeed(query) };
  }
  return { page: "parent" };
}

function parseSpeed(query: string): number {
  const value = new URLSearchParams(query).get("speed");
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_SPEED);
}

export function playHash(id: string): string {
  return `#/play/${encodeURIComponent(id)}`;
}
