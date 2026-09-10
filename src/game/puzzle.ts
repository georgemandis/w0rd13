import { wordsForLength } from "../words";
import { PACK_WORDS } from "../words/packs";
import { HUBS } from "../words/hubs";
import { scoreGuess, isConsistent, type Feedback } from "./feedback";
import { hashString, mulberry32, pick } from "./rng";
import { DIFFICULTIES, DEFAULT_DIFFICULTY, DEFAULT_LENGTH, DEFAULT_VOCAB, DEFAULT_KIND, ORBIT_GUESSES, ORBIT_WORDS, PACKS, ROUNDS_PER_PUZZLE, type Difficulty, type Kind, type Mode, type Vocab } from "./config";

export { DIFFICULTIES, DEFAULT_DIFFICULTY, DEFAULT_LENGTH, ROUNDS_PER_PUZZLE, localDateString, type Difficulty, type Mode } from "./config";

export interface PuzzleOptions {
  date: string;
  mode: Mode;
  length?: number;
  difficulty?: Difficulty;
  /** Word theme id from PACKS (five-letter only). "" or undefined for the mixed list. */
  pack?: string;
  /** "everyday" restricts answers to the most common spoken words. Ignored when a pack is set. */
  vocab?: Vocab;
  /** "orbit": rounds show a ring of neighbouring words instead of coloured clues. */
  kind?: Kind;
}

export interface Clue {
  word: string;
  feedback: Feedback;
}

export interface Round {
  answer: string;
  clues: Clue[];
  /** Orbit mode: the neighbouring words shown around the secret, nearest first. Rings reveal from the far end. */
  hub?: string[];
  /** Orbit mode: a theme pack the secret belongs to, shown as a category hint. */
  theme?: string;
}

export interface Puzzle {
  date: string;
  mode: Mode;
  length: number;
  difficulty: Difficulty;
  pack: string;
  vocab: Vocab;
  kind: Kind;
  rounds: Round[];
}

const MAX_CLUES = 6;
const SAMPLE_SIZE = 120;
const FINISHER_BUDGET = 4000;

export function puzzleSeed(date: string, mode: Mode, length = DEFAULT_LENGTH, difficulty: Difficulty = DEFAULT_DIFFICULTY, pack = "", vocab: Vocab = DEFAULT_VOCAB, kind: Kind = DEFAULT_KIND): number {
  const variant = length === DEFAULT_LENGTH && difficulty === DEFAULT_DIFFICULTY ? "" : `:${length}:${difficulty}`;
  const extra = pack ? `:${pack}` : vocab === "everyday" ? ":everyday" : "";
  return hashString(`w0rd13:${mode}:${date}${variant}${extra}${kind === "orbit" ? ":orbit" : ""}`);
}

/** Orbit mode: five secret words, each shown with its nearest neighbours in meaning. */
function generateOrbit(date: string, mode: Mode, difficulty: Difficulty, pack: string): Puzzle {
  const all = Object.keys(HUBS);
  const inPack = pack ? all.filter((w) => PACK_WORDS[pack]?.includes(w)) : all;
  const pool = inPack.length >= ROUNDS_PER_PUZZLE ? inPack : all;
  const rand = mulberry32(puzzleSeed(date, mode, DEFAULT_LENGTH, difficulty, pack, DEFAULT_VOCAB, "orbit"));
  const rounds: Round[] = [];
  const used = new Set<string>();
  while (rounds.length < ROUNDS_PER_PUZZLE) {
    const answer = pick(rand, pool);
    if (used.has(answer)) continue;
    used.add(answer);
    const themes = Object.keys(PACK_WORDS).filter((id) => !PACKS[id]?.loose && PACK_WORDS[id]!.includes(answer));
    const theme = pack && themes.includes(pack) ? pack : pick(rand, themes);
    rounds.push({ answer, clues: [], hub: HUBS[answer]!.slice(0, ORBIT_GUESSES * ORBIT_WORDS[difficulty]), theme });
  }
  return { date, mode, length: DEFAULT_LENGTH, difficulty, pack, vocab: DEFAULT_VOCAB, kind: "orbit", rounds };
}

function survivorsAfter(candidates: string[], answer: string, word: string, feedback: Feedback): string[] {
  return candidates.filter((w) => w === answer || isConsistent(w, word, feedback));
}

/**
 * Build a round for `answer` with (ideally) exactly `targetClues` clues whose
 * combined feedback leaves `answer` as the only consistent word among
 * `candidates` (the full answer list, or a themed pack). Clue words are drawn
 * from `answers` (common words) and, for the finishing clue, `allowed`.
 * Early clues split the candidates greedily; the final clue is searched for
 * specifically so that it finishes the job. Returns null if that fails
 * within MAX_CLUES.
 */
function buildRound(answer: string, targetClues: number, candidates: string[], answers: string[], allowed: string[], rand: () => number): Round | null {
  const clues: Clue[] = [];
  let survivors = candidates;
  const used = (w: string) => w === answer || clues.some((c) => c.word === w);

  while (clues.length < MAX_CLUES) {
    const finishing = clues.length + 1 >= targetClues;
    let best: { word: string; feedback: Feedback; survivors: string[] } | null = null;

    if (finishing) {
      // Look for a single guess that isolates the answer. Common words first, then the full list.
      for (const pool of [answers, allowed]) {
        const offset = Math.floor(rand() * pool.length);
        for (let i = 0; i < Math.min(pool.length, FINISHER_BUDGET); i++) {
          const word = pool[(offset + i) % pool.length]!;
          if (used(word)) continue;
          const feedback = scoreGuess(word, answer);
          const next = survivorsAfter(survivors, answer, word, feedback);
          if (!best || next.length < best.survivors.length) best = { word, feedback, survivors: next };
          if (next.length === 1) break;
        }
        if (best?.survivors.length === 1) break;
      }
    } else {
      for (let i = 0; i < SAMPLE_SIZE; i++) {
        const word = pick(rand, answers);
        if (used(word)) continue;
        const feedback = scoreGuess(word, answer);
        const next = survivorsAfter(survivors, answer, word, feedback);
        if (!best || next.length < best.survivors.length) best = { word, feedback, survivors: next };
      }
    }
    if (!best) return null;

    clues.push({ word: best.word, feedback: best.feedback });
    survivors = best.survivors;
    if (survivors.length === 1 && clues.length >= targetClues) return { answer, clues };
  }
  return null;
}

export function generatePuzzle({ date, mode, length = DEFAULT_LENGTH, difficulty = DEFAULT_DIFFICULTY, pack = "", vocab = DEFAULT_VOCAB, kind = DEFAULT_KIND }: PuzzleOptions): Puzzle {
  if (kind === "orbit") return generateOrbit(date, mode, difficulty, pack);
  const { answers, allowed, easy } = wordsForLength(length);
  let candidates = answers;
  if (pack) {
    if (length !== DEFAULT_LENGTH) throw new Error("Word themes are five letters only");
    const words = PACK_WORDS[pack];
    if (!words) throw new Error(`Unknown word theme ${pack}`);
    candidates = words;
    vocab = DEFAULT_VOCAB;
  } else if (vocab === "everyday") {
    candidates = easy;
  }
  const rand = mulberry32(puzzleSeed(date, mode, length, difficulty, pack, vocab));
  const target = DIFFICULTIES[difficulty].clues;
  const rounds: Round[] = [];
  const used = new Set<string>();

  while (rounds.length < ROUNDS_PER_PUZZLE) {
    const answer = pick(rand, candidates);
    if (used.has(answer)) continue;
    const round = buildRound(answer, target, candidates, answers, allowed, rand);
    if (!round) continue;
    used.add(answer);
    rounds.push(round);
  }
  return { date, mode, length, difficulty, pack, vocab, kind, rounds };
}
