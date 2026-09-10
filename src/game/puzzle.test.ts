import { describe, expect, test } from "bun:test";
import { generatePuzzle, puzzleSeed, DIFFICULTIES, type Difficulty, type Puzzle } from "./puzzle";
import { scoreGuess, isConsistent } from "./feedback";
import { wordsForLength } from "../words";
import { PACK_WORDS } from "../words/packs";
import { PACKS } from "./config";

function expectValid(p: Puzzle, minClues: number) {
  const lists = wordsForLength(p.length);
  const answers = p.pack ? PACK_WORDS[p.pack]! : p.vocab === "everyday" ? lists.easy : lists.answers;
  expect(p.rounds).toHaveLength(5);
  expect(new Set(p.rounds.map((r) => r.answer)).size).toBe(5);
  for (const round of p.rounds) {
    expect(round.answer).toHaveLength(p.length);
    expect(round.clues.length).toBeGreaterThanOrEqual(minClues);
    for (const clue of round.clues) {
      expect(clue.word).not.toBe(round.answer);
      expect(clue.word).toHaveLength(p.length);
      expect(clue.feedback).toEqual(scoreGuess(clue.word, round.answer));
    }
    const survivors = answers.filter((w) => round.clues.every((c) => isConsistent(w, c.word, c.feedback)));
    expect(survivors).toEqual([round.answer]);
  }
}

describe("puzzleSeed", () => {
  test("daily and bonus seeds differ for the same date", () => {
    expect(puzzleSeed("2026-09-09", "daily")).not.toBe(puzzleSeed("2026-09-09", "bonus"));
  });
  test("different dates give different seeds", () => {
    expect(puzzleSeed("2026-09-09", "daily")).not.toBe(puzzleSeed("2026-09-10", "daily"));
  });
  test("length and difficulty change the seed", () => {
    expect(puzzleSeed("2026-09-09", "daily", 7, "normal")).not.toBe(puzzleSeed("2026-09-09", "daily"));
    expect(puzzleSeed("2026-09-09", "daily", 5, "hard")).not.toBe(puzzleSeed("2026-09-09", "daily"));
  });
});

describe("generatePuzzle", () => {
  const puzzle = generatePuzzle({ date: "2026-09-09", mode: "daily" });

  test("is deterministic for the same options", () => {
    expect(generatePuzzle({ date: "2026-09-09", mode: "daily" })).toEqual(puzzle);
  });

  test("defaults to five letters, normal difficulty, three clues", () => {
    expect(puzzle.length).toBe(5);
    expect(puzzle.difficulty).toBe("normal");
    expectValid(puzzle, 3);
    expect(puzzle.rounds.every((r) => r.clues.length === 3)).toBe(true);
  });

  test("several dates and both modes all generate valid puzzles", () => {
    for (const day of [1, 2, 10, 28]) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      for (const mode of ["daily", "bonus"] as const) {
        expectValid(generatePuzzle({ date, mode }), 3);
      }
    }
  });

  test("every difficulty produces uniquely solvable puzzles with the right clue count", () => {
    for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[]) {
      const p = generatePuzzle({ date: "2026-09-09", mode: "daily", difficulty });
      expectValid(p, DIFFICULTIES[difficulty].clues);
      expect(p.rounds.every((r) => r.clues.length === DIFFICULTIES[difficulty].clues)).toBe(true);
    }
  });

  test("every word length from 3 to 10 works", () => {
    for (let length = 3; length <= 10; length++) {
      expectValid(generatePuzzle({ date: "2026-09-09", mode: "daily", length }), 3);
    }
  });

  test("every word pack is well formed and generates themed, solvable puzzles", () => {
    const answerSet = new Set(wordsForLength(5).answers);
    for (const pack of Object.keys(PACKS)) {
      const words = PACK_WORDS[pack]!;
      expect(words.length).toBeGreaterThanOrEqual(20);
      expect(new Set(words).size).toBe(words.length);
      if (PACKS[pack]!.loose) {
        expect(words.every((w) => /^[a-z0-9]{5}$/.test(w))).toBe(true);
      } else {
        expect(words.every((w) => answerSet.has(w))).toBe(true);
      }
      const p = generatePuzzle({ date: "2026-09-09", mode: "daily", pack });
      expect(p.pack).toBe(pack);
      expect(p.rounds.every((r) => words.includes(r.answer))).toBe(true);
      expectValid(p, 3);
    }
  });

  test("everyday vocabulary draws answers from the common subset at every length", () => {
    for (let length = 3; length <= 10; length++) {
      const { answers, easy } = wordsForLength(length);
      expect(easy.length).toBeGreaterThan(100);
      expect(easy.every((w) => answers.includes(w))).toBe(true);
      const p = generatePuzzle({ date: "2026-09-09", mode: "daily", length, vocab: "everyday" });
      expect(p.vocab).toBe("everyday");
      expect(p.rounds.every((r) => easy.includes(r.answer))).toBe(true);
      expectValid(p, 3);
    }
    expect(puzzleSeed("2026-09-09", "daily", 5, "normal", "", "everyday")).not.toBe(puzzleSeed("2026-09-09", "daily"));
  });

  test("a pack changes the seed and only works at five letters", () => {
    expect(puzzleSeed("2026-09-09", "daily", 5, "normal", "animals")).not.toBe(puzzleSeed("2026-09-09", "daily"));
    expect(() => generatePuzzle({ date: "2026-09-09", mode: "daily", length: 6, pack: "animals" })).toThrow();
  });

  test("the extremes: 3-letter extreme and 10-letter easy", () => {
    expectValid(generatePuzzle({ date: "2026-09-09", mode: "bonus", length: 3, difficulty: "extreme" }), 1);
    expectValid(generatePuzzle({ date: "2026-09-09", mode: "bonus", length: 10, difficulty: "easy" }), 4);
  });
});
