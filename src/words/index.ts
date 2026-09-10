import { ANSWERS } from "./answers";
import { ALLOWED } from "./allowed";
import { WORDS_BY_LENGTH } from "./byLength";
import { DEFAULT_LENGTH } from "../game/config";

export interface WordLists {
  /** Puzzle answers and clue words. */
  answers: string[];
  /** Every word accepted as a guess. */
  allowed: string[];
  /** The "everyday" vocabulary: the most common spoken words, a subset of answers. */
  easy: string[];
}

/** Length 5 uses the canonical Wordle lists; other lengths come from byLength.ts. */
export function wordsForLength(length: number): WordLists {
  const lists = WORDS_BY_LENGTH[length];
  if (length === DEFAULT_LENGTH) return { answers: ANSWERS, allowed: ALLOWED, easy: lists?.easy ?? ANSWERS };
  if (!lists) throw new Error(`No word list for length ${length}`);
  return lists;
}
