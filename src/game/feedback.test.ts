import { describe, expect, test } from "bun:test";
import { scoreGuess, isConsistent } from "./feedback";

describe("scoreGuess", () => {
  test("all green on exact match", () => {
    expect(scoreGuess("crane", "crane")).toEqual(["g", "g", "g", "g", "g"]);
  });

  test("marks greens, yellows and greys", () => {
    // answer: robot, guess: torso -> t(y) o(g) r(y) s(x) o(y)
    expect(scoreGuess("torso", "robot")).toEqual(["y", "g", "y", "x", "y"]);
  });

  test("does not double count repeated letters", () => {
    // answer "lemon": first l green, second l grey, m yellow
    expect(scoreGuess("llama", "lemon")).toEqual(["g", "x", "x", "y", "x"]);
    // answer 'allow', guess 'lulls' -> l(y) u(x) l(g) l(x) s(x)
    expect(scoreGuess("lulls", "allow")).toEqual(["y", "x", "g", "x", "x"]);
  });
});

describe("isConsistent", () => {
  test("a candidate is consistent when it reproduces the same feedback", () => {
    const fb = scoreGuess("torso", "robot");
    expect(isConsistent("robot", "torso", fb)).toBe(true);
    expect(isConsistent("crane", "torso", fb)).toBe(false);
  });
});
