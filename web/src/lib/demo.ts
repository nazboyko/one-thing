// The static demo build (VITE_DEMO=1) plays only the built-in sample, with
// no server behind it. It is the same file the Go server embeds.
import sample from "../../../internal/mission/sample.json";
import type { Mission } from "./api";

export const DEMO = import.meta.env.VITE_DEMO === "1";

export const demoSample = { ...sample, id: "sample" } as Mission;
