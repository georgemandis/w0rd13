import { describe, expect, test } from "bun:test";
import { BADGES, badgeLine, pickBadge, qualifyingBadges, type BadgeContext } from "./badges";

const base = (over: Partial<BadgeContext> = {}): BadgeContext => ({
  results: [
    { correct: true, ms: 7_000, guess: "crane", answer: "crane" },
    { correct: true, ms: 34_000, guess: "sloth", answer: "sloth" },
    { correct: true, ms: 104_000, guess: "brick", answer: "brick" },
    { correct: true, ms: 16_000, guess: "dwarf", answer: "dwarf" },
    { correct: true, ms: 14_000, guess: "fjord", answer: "fjord" },
  ],
  finishedAt: new Date(2026, 8, 17, 15, 30), // a Thursday afternoon
  settings: { mode: "daily", length: 5, difficulty: "normal", clock: "stopwatch", pack: "", vocab: "standard", kind: "clues" },
  theme: "classic",
  streak: 1,
  daysPlayed: 1,
  gamesTodayBefore: 0,
  late: false,
  filedBug: false,
  filedFeature: false,
  ...over,
});

describe("the badge list", () => {
  test("has plenty, with unique ids and names and a blurb each", () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    expect(new Set(BADGES.map((b) => b.name)).size).toBe(BADGES.length);
    for (const b of BADGES) {
      expect(b.blurb.length).toBeGreaterThan(10);
      expect(b.emoji.length).toBeGreaterThan(0);
    }
  });

  test("no predicate throws on a sparse context", () => {
    const sparse = base({ results: [{ correct: false, ms: 0, exploded: true }] });
    expect(() => qualifyingBadges(sparse)).not.toThrow();
  });
});

describe("individual badges", () => {
  const ids = (c: BadgeContext) => qualifyingBadges(c).map((b) => b.id);

  test("time of day and week", () => {
    expect(ids(base({ finishedAt: new Date(2026, 8, 14, 6, 0) }))).toContain("early-bird");
    expect(ids(base({ finishedAt: new Date(2026, 8, 14, 6, 0) }))).toContain("monday");
    expect(ids(base({ finishedAt: new Date(2026, 8, 19, 23, 30) }))).toContain("night-owl");
    expect(ids(base({ finishedAt: new Date(2026, 8, 19, 23, 30) }))).toContain("weekend-warrior");
    expect(ids(base({ finishedAt: new Date(2026, 8, 29, 1, 0) }))).toContain("witching-hour");
    expect(ids(base({ finishedAt: new Date(2026, 8, 29, 1, 0) }))).toContain("leap-of-faith");
  });

  test("speed", () => {
    expect(ids(base({ results: base().results.map((r, i) => (i === 0 ? { ...r, ms: 3_000 } : r)) }))).toContain("harold");
    expect(ids(base({ results: base().results.map((r) => ({ ...r, ms: 9_000 })) }))).toContain("beatrice");
    expect(ids(base({ results: base().results.map((r, i) => ({ ...r, ms: 50_000 - i * 5_000 })) }))).toContain("getting-warmer");
    expect(ids(base({ results: base().results.map((r, i) => ({ ...r, ms: i === 4 ? 2_000 : 20_000 })) }))).toContain("big-finish");
  });

  test("shape of the run", () => {
    const shaped = (p: string) => base({ results: base().results.map((r, i) => ({ ...r, correct: p[i] === "g" })) });
    expect(ids(shaped("xgggg"))).toContain("gwen");
    expect(ids(shaped("xgggg"))).toContain("coach-terry");
    expect(ids(shaped("ggxgg"))).toContain("rocco");
    expect(ids(shaped("gxgxg"))).toContain("zed");
    expect(ids(shaped("xxxxg"))).toContain("biscuit");
    expect(ids(shaped("gggxg"))).toContain("denise");
    expect(ids(base())).toContain("sponge-ian");
  });

  test("letters, properly", () => {
    const q = base({ results: base().results.map((r, i) => (i === 0 ? { ...r, guess: "quiet", answer: "quiet" } : r)) });
    expect(ids(q)).toContain("quentin");
    expect(ids(q)).toContain("priya"); // quiet has three vowels
    expect(ids(base())).toContain("ruth"); // c s b d f
    expect(ids(base())).toContain("no-vowels-guess"); // fjord has one vowel
  });

  test("settings, theme, habits, endings, filing", () => {
    expect(ids(base({ settings: { ...base().settings, clock: "off" } }))).toContain("bartholomew");
    expect(ids(base({ settings: { ...base().settings, kind: "orbit" }, results: base().results.map((r) => ({ ...r, tries: 5 })) }))).toContain("doreen");
    expect(ids(base({ theme: "bottomline" }))).toContain("smart-brevity");
    expect(ids(base({ streak: 7 }))).toContain("calendar-pete");
    expect(ids(base({ gamesTodayBefore: 1 }))).toContain("salvatore");
    expect(ids(base({ results: [...base().results.slice(0, 2), { correct: false, ms: 0, gaveUp: true }] }))).toContain("montgomery");
    expect(ids(base({ late: true }))).toContain("amelia");
    expect(ids(base({ results: base().results.map((r, i) => ({ ...r, correct: i < 3 })) }))).toContain("tesla");
    expect(ids(base())).not.toContain("tesla");
    expect(ids(base({ filedBug: true }))).toContain("wanda");
    expect(ids(base({ filedBug: true }))).not.toContain("ernie");
    expect(ids(base({ filedBug: true, filedFeature: true }))).toContain("ernie");
  });
});

describe("pickBadge", () => {
  test("prefers badges never earned before, then falls back to any", () => {
    const c = base();
    const all = qualifyingBadges(c).map((b) => b.id);
    expect(all.length).toBeGreaterThan(1);
    const first = pickBadge(c, [], () => 0);
    expect(all).toContain(first);
    const next = pickBadge(c, [first], () => 0);
    expect(next).not.toBe(first);
    const everything = pickBadge(c, all, () => 0);
    expect(all).toContain(everything);
  });

  test("returns nothing when nothing applies", () => {
    const dull = base({ results: [], finishedAt: new Date(2026, 8, 17, 15, 30) });
    expect(pickBadge(dull)).toBe("");
  });

  test("badgeLine formats emoji and name", () => {
    expect(badgeLine("harold")).toBe("🦔 Harold the Hedgie");
    expect(badgeLine("nope")).toBe("");
  });
});
