// Where a saved mission can be opened: on the laptop that runs the server
// (works with Wi-Fi off), and on a tablet in the same home network.

import { playHash } from "./route";

/** The parts of window.location these functions need. */
export interface PageLocation {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
}

/** True for addresses that only reach the machine itself. */
export function isLoopback(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

function pageBase(loc: PageLocation): string {
  return `${loc.protocol}//${loc.hostname}${loc.port ? `:${loc.port}` : ""}${loc.pathname}`;
}

/** The address that always works on the laptop, even with Wi-Fi off. */
export function laptopBase(loc: PageLocation): string {
  if (isLoopback(loc.hostname)) return pageBase(loc);
  // The page was opened through the network address. The same server also
  // answers on localhost, on the same port.
  return pageBase({ ...loc, hostname: "localhost" });
}

/**
 * The address a tablet in the home network can open, or null when the laptop
 * has no network address right now. `lanUrls` comes from the server.
 */
export function tabletBase(lanUrls: readonly string[], loc: PageLocation): string | null {
  const page = isLoopback(loc.hostname) ? null : pageBase(loc);
  return lanUrls.find((u) => u === page) ?? lanUrls[0] ?? page;
}

export interface PlayLinks {
  laptop: string;
  tablet: string | null;
}

export function playLinks(id: string, lanUrls: readonly string[], loc: PageLocation): PlayLinks {
  const hash = playHash(id);
  const tablet = tabletBase(lanUrls, loc);
  return { laptop: laptopBase(loc) + hash, tablet: tablet === null ? null : tablet + hash };
}
