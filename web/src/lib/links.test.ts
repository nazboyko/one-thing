import { describe, expect, it } from "vitest";
import { isLoopback, laptopBase, playLinks, tabletBase, type PageLocation } from "./links";

const at = (hostname: string, port = "8787", pathname = "/"): PageLocation => ({ protocol: "http:", hostname, port, pathname });
const LAN = "http://192.168.1.20:8787/";

describe("isLoopback", () => {
  it.each(["localhost", "LOCALHOST", "app.localhost", "127.0.0.1", "127.1.2.3", "[::1]", "::1"])("%s is the machine itself", (host) => {
    expect(isLoopback(host)).toBe(true);
  });

  it.each(["192.168.1.20", "10.0.0.7", "laptop.local", "localhost.example.com", "1127.0.0.1", "example.com"])("%s is not", (host) => {
    expect(isLoopback(host)).toBe(false);
  });
});

describe("laptopBase", () => {
  it("keeps the page address when the page is already on localhost", () => {
    expect(laptopBase(at("localhost"))).toBe("http://localhost:8787/");
    expect(laptopBase(at("127.0.0.1"))).toBe("http://127.0.0.1:8787/");
    expect(laptopBase(at("[::1]"))).toBe("http://[::1]:8787/");
  });

  it("keeps the dev server port", () => {
    expect(laptopBase(at("localhost", "5173"))).toBe("http://localhost:5173/");
  });

  it("points at localhost on the same port when the page was opened through the network", () => {
    expect(laptopBase(at("192.168.1.20"))).toBe("http://localhost:8787/");
    expect(laptopBase(at("10.0.0.7", "9000"))).toBe("http://localhost:9000/");
  });

  it("leaves the port out when the page has none", () => {
    expect(laptopBase(at("192.168.1.20", ""))).toBe("http://localhost/");
  });
});

describe("tabletBase", () => {
  it("uses the server's network address", () => {
    expect(tabletBase([LAN], at("localhost"))).toBe(LAN);
  });

  it("is null on localhost when the laptop has no network address (Wi-Fi off)", () => {
    expect(tabletBase([], at("localhost"))).toBeNull();
    expect(tabletBase([], at("127.0.0.1"))).toBeNull();
  });

  it("never offers localhost to a tablet", () => {
    expect(tabletBase([], at("localhost"))).not.toBe("http://localhost:8787/");
  });

  it("prefers the address the page itself was opened with", () => {
    const wifi = "http://10.0.0.7:8787/";
    expect(tabletBase([LAN, wifi], at("10.0.0.7"))).toBe(wifi);
    expect(tabletBase([LAN, wifi], at("localhost"))).toBe(LAN);
  });

  it("falls back to the page address when the server reports none", () => {
    expect(tabletBase([], at("192.168.1.20"))).toBe(LAN);
  });
});

describe("playLinks", () => {
  it("gives a laptop link and a tablet link for a mission", () => {
    expect(playLinks("a1b2c3d4", [LAN], at("localhost"))).toEqual({
      laptop: "http://localhost:8787/#/play/a1b2c3d4",
      tablet: "http://192.168.1.20:8787/#/play/a1b2c3d4",
    });
  });

  it("still gives the laptop link with Wi-Fi off, and no tablet link", () => {
    expect(playLinks("a1b2c3d4", [], at("localhost"))).toEqual({
      laptop: "http://localhost:8787/#/play/a1b2c3d4",
      tablet: null,
    });
  });

  it("gives a localhost laptop link even when the page was opened through the network", () => {
    expect(playLinks("a1b2c3d4", [LAN], at("192.168.1.20"))).toEqual({
      laptop: "http://localhost:8787/#/play/a1b2c3d4",
      tablet: "http://192.168.1.20:8787/#/play/a1b2c3d4",
    });
  });
});
