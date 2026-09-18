import { WORDS_BY_LENGTH } from "./byLength";
import { OVERRIDES } from "./overrides";

export interface WordLists {
  /** Puzzle answers and clue words. */
  answers: string[];
  /** Every word accepted as a guess. */
  allowed: string[];
  /** The "everyday" vocabulary: the most common spoken words, a subset of answers. */
  easy: string[];
}

/**
 * Word lists for a length from 3 to 10: the private overrides.ts if it covers
 * that length, otherwise the generated lists from scripts/build-words.ts.
 */
export function wordsForLength(length: number): WordLists {
  const lists = OVERRIDES[length] ?? WORDS_BY_LENGTH[length];
  if (!lists) throw new Error(`No word list for length ${length}`);
  return lists;
}
