/** g = green (right letter, right spot), y = yellow (in word, wrong spot), x = grey (absent). */
export type Mark = "g" | "y" | "x";
export type Feedback = Mark[];

/** Standard Wordle scoring for words of any length, with correct handling of repeated letters. */
export function scoreGuess(guess: string, answer: string): Feedback {
  const n = guess.length;
  const result: Feedback = new Array<Mark>(n).fill("x");
  const remaining: Record<string, number> = {};

  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "g";
    } else {
      remaining[answer[i]!] = (remaining[answer[i]!] ?? 0) + 1;
    }
  }
  for (let i = 0; i < n; i++) {
    if (result[i] === "g") continue;
    const ch = guess[i]!;
    if (remaining[ch]) {
      result[i] = "y";
      remaining[ch]--;
    }
  }
  return result;
}

/** Would `candidate` produce exactly `feedback` if `guess` were played against it? */
export function isConsistent(candidate: string, guess: string, feedback: Feedback): boolean {
  const got = scoreGuess(guess, candidate);
  for (let i = 0; i < got.length; i++) if (got[i] !== feedback[i]) return false;
  return true;
}
