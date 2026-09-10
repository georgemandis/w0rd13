import { describe, expect, test } from "bun:test";
import { formatTime, buildShareText, formatPuzzleDate, pickAward, GOOD_AWARDS, BAD_AWARDS, QUIT_AWARDS } from "./share";
import { variantLabel } from "./config";

describe("variantLabel", () => {
  test("is empty for the default game", () => {
    expect(variantLabel(5, "normal")).toBe("");
  });
  test("names the pack instead of the length, then difficulty and clock", () => {
    expect(variantLabel(5, "normal", "stopwatch", "animals")).toBe("Animals");
    expect(variantLabel(5, "hard", "countdown", "purple")).toBe("Purple Rain, hard, countdown");
    expect(variantLabel(7, "extreme")).toBe("7 letters, extreme");
    expect(variantLabel(5, "normal", "stopwatch", "", "everyday")).toBe("everyday");
    expect(variantLabel(6, "hard", "countdown", "", "everyday")).toBe("6 letters, everyday, hard, countdown");
    expect(variantLabel(5, "normal", "stopwatch", "animals", "everyday")).toBe("Animals");
  });
});

describe("formatTime", () => {
  test("formats milliseconds as m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(7_400)).toBe("0:07");
    expect(formatTime(104_000)).toBe("1:44");
    expect(formatTime(175_000)).toBe("2:55");
    expect(formatTime(600_000)).toBe("10:00");
  });
});

describe("formatPuzzleDate", () => {
  test("renders an ISO date as a long US date", () => {
    expect(formatPuzzleDate("2026-09-09")).toBe("September 9, 2026");
  });
});

const perfect = [
  { correct: true, ms: 7_000 },
  { correct: true, ms: 34_000 },
  { correct: true, ms: 104_000 },
  { correct: true, ms: 16_000 },
  { correct: true, ms: 14_000 },
];

describe("pickAward", () => {
  test("a perfect run earns a good award", () => {
    const award = pickAward(perfect, () => 0.99);
    expect(GOOD_AWARDS).toContain(award);
  });

  test("two or fewer correct earns a bad award", () => {
    const rough = perfect.map((r, i) => ({ ...r, correct: i < 2 }));
    expect(BAD_AWARDS).toContain(pickAward(rough, () => 0));
  });

  test("exploding always earns a bad award, even with four right", () => {
    const boom = perfect.map((r, i) => (i === 4 ? { ...r, correct: false, exploded: true } : r));
    expect(BAD_AWARDS).toContain(pickAward(boom, () => 0));
  });

  test("giving up earns a sad award, never a clown", () => {
    const quit = perfect.map((r, i) => (i >= 3 ? { ...r, correct: false, gaveUp: true, ms: i === 3 ? 9_000 : 0 } : r));
    for (const x of [0, 0.5, 0.99]) {
      const award = pickAward(quit, () => x);
      expect(QUIT_AWARDS).toContain(award);
      expect(award).not.toBe("🤡");
    }
  });

  test("a middling run earns nothing", () => {
    const meh = perfect.map((r, i) => ({ ...r, correct: i < 3 }));
    expect(pickAward(meh, () => 0)).toBe("");
  });

  test("the random source picks among the options", () => {
    expect(pickAward(perfect, () => 0)).toBe(GOOD_AWARDS[0]!);
    expect(pickAward(perfect, () => 0.999)).toBe(GOOD_AWARDS[GOOD_AWARDS.length - 1]!);
  });
});

describe("buildShareText", () => {
  test("keeps the classic summary line and adds a per-word breakdown", () => {
    const text = buildShareText({ date: "2026-09-09", mode: "bonus", results: perfect });
    expect(text).toBe(
      [
        "w0rd13",
        "Bonus September 9, 2026",
        "🟩🟩🟩🟩🟩 2:55",
        "",
        "🟩 0:07",
        "🟩 0:34",
        "🟩 1:44",
        "🟩 0:16",
        "🟩 0:14",
      ].join("\n"),
    );
  });

  test("a variant is shown after the date", () => {
    const text = buildShareText({ date: "2026-09-09", mode: "bonus", results: perfect, variant: "7 letters, extreme" });
    expect(text.split("\n")[1]).toBe("Bonus September 9, 2026 (7 letters, extreme)");
  });

  test("an award is appended to the summary line", () => {
    const text = buildShareText({ date: "2026-09-09", mode: "daily", results: perfect, award: "🦄" });
    expect(text.split("\n")[2]).toBe("🟩🟩🟩🟩🟩 2:55 🦄");
  });

  test("countdown runs report time left instead of time spent", () => {
    const text = buildShareText({ date: "2026-09-09", mode: "daily", results: perfect, variant: "countdown", timeLeftMs: 97_000, award: "🏆" });
    expect(text.split("\n")[1]).toBe("September 9, 2026 (countdown)");
    expect(text.split("\n")[2]).toBe("🟩🟩🟩🟩🟩 1:37 left 🏆");
  });

  test("an exploded countdown shows the blast and zero time left", () => {
    const results = [
      { correct: true, ms: 20_000 },
      { correct: true, ms: 40_000 },
      { correct: false, ms: 50_000 },
      { correct: false, ms: 55_000, exploded: true },
    ];
    const text = buildShareText({ date: "2026-09-09", mode: "daily", results, variant: "countdown", timeLeftMs: -300 });
    expect(text.split("\n")[2]).toBe("🟩🟩⬛💥 0:00 left");
    expect(text.split("\n").slice(4)).toEqual(["🟩 0:20", "🟩 0:40", "⬛ 0:50", "💥 0:55"]);
  });

  test("giving up shows white flags, and unreached words stay out of the breakdown", () => {
    const results = [
      { correct: true, ms: 20_000 },
      { correct: false, ms: 40_000 },
      { correct: false, ms: 12_000, gaveUp: true },
      { correct: false, ms: 0, gaveUp: true },
      { correct: false, ms: 0, gaveUp: true },
    ];
    const text = buildShareText({ date: "2026-09-09", mode: "daily", results, award: "💔" });
    expect(text.split("\n")[2]).toBe("🟩⬛🏳️🏳️🏳️ 1:12 💔");
    expect(text.split("\n").slice(4)).toEqual(["🟩 0:20", "⬛ 0:40", "🏳️ 0:12"]);
  });

  test("daily puzzles omit the Bonus label and misses show as black squares", () => {
    const text = buildShareText({
      date: "2026-09-09",
      mode: "daily",
      results: [
        { correct: true, ms: 5_000 },
        { correct: false, ms: 65_000 },
        { correct: true, ms: 9_000 },
        { correct: true, ms: 1_000 },
        { correct: false, ms: 30_000 },
      ],
    });
    expect(text.split("\n")[1]).toBe("September 9, 2026");
    expect(text.split("\n")[2]).toBe("🟩⬛🟩🟩⬛ 1:50");
    expect(text.split("\n")[4]).toBe("🟩 0:05");
    expect(text.split("\n")[5]).toBe("⬛ 1:05");
  });
});
