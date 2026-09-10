import { generatePuzzle, localDateString, type Puzzle, type PuzzleOptions } from "./game/puzzle";
import { DEFAULT_DIFFICULTY, DEFAULT_LENGTH, DEFAULT_VOCAB, isDifficulty, isLength, isPack, isVocab } from "./game/config";
import { scoreGuess } from "./game/feedback";
import { wordsForLength } from "./words";
import { PACK_WORDS } from "./words/packs";

/**
 * The game API, written against the standard Request/Response types so the
 * same code runs under Bun (src/server.ts) and Cloudflare Workers (src/worker.ts).
 *
 *   GET  /api/puzzle?date&mode&length&difficulty&pack&vocab  -> clues only
 *   POST /api/guess  {round, guess}                     -> validity, answer, feedback
 *   POST /api/reveal {round}                            -> answer (countdown blew up)
 */

/** Optional shared store (the Worker uses the edge cache) so fresh isolates don't regenerate puzzles. */
export interface PuzzleStore {
  get(key: string): Promise<Puzzle | null>;
  put(key: string, puzzle: Puzzle): Promise<void>;
}

const cache = new Map<string, Puzzle>();
const allowedByLength = new Map<number, Set<string>>();

function isAllowed(word: string, length: number, pack: string): boolean {
  if (pack && PACK_WORDS[pack]?.includes(word)) return true;
  let set = allowedByLength.get(length);
  if (!set) {
    set = new Set(wordsForLength(length).allowed);
    allowedByLength.set(length, set);
  }
  return set.has(word);
}

export async function getPuzzle(opts: Required<PuzzleOptions>, store?: PuzzleStore): Promise<Puzzle> {
  const key = `${opts.mode}:${opts.date}:${opts.length}:${opts.difficulty}:${opts.pack}:${opts.vocab}`;
  let puzzle: Puzzle | null = cache.get(key) ?? null;
  if (puzzle) return puzzle;
  puzzle = (await store?.get(key).catch(() => null)) ?? null;
  if (!puzzle) {
    puzzle = generatePuzzle(opts);
    await store?.put(key, puzzle).catch(() => undefined);
  }
  cache.set(key, puzzle);
  return puzzle;
}

const bad = (error: string) => Response.json({ error }, { status: 400 });

export function parseParams(url: URL): Required<PuzzleOptions> | Response {
  const q = url.searchParams;
  const date = q.get("date") ?? localDateString();
  const mode = q.get("mode") ?? "daily";
  const length = q.has("length") ? Number(q.get("length")) : DEFAULT_LENGTH;
  const difficulty = q.get("difficulty") ?? DEFAULT_DIFFICULTY;
  const packParam = q.get("pack") ?? "";
  const vocab = q.get("vocab") ?? DEFAULT_VOCAB;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("bad date");
  if (mode !== "daily" && mode !== "bonus") return bad("bad mode");
  if (!isLength(length)) return bad("bad length");
  if (!isDifficulty(difficulty)) return bad("bad difficulty");
  if (packParam && !isPack(packParam)) return bad("bad pack");
  if (!isVocab(vocab)) return bad("bad vocab");
  // Word themes are five-letter only; other lengths fall back to the mixed list.
  const pack = length === DEFAULT_LENGTH ? packParam : "";
  return { date, mode, length, difficulty, pack, vocab: pack ? DEFAULT_VOCAB : vocab };
}

async function readRound(req: Request, puzzle: Puzzle): Promise<{ round: number; guess: string } | Response> {
  const body = (await req.json().catch(() => null)) as { round?: unknown; guess?: unknown } | null;
  const round = body?.round;
  if (typeof round !== "number" || !puzzle.rounds[round]) return bad("bad round");
  return { round, guess: String(body?.guess ?? "").toLowerCase() };
}

/** Returns a Response for /api/* requests, or null if the path is not an API route. */
export async function handleApi(req: Request, store?: PuzzleStore): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/")) return null;
  const params = parseParams(url);
  if (params instanceof Response) return params;
  const puzzle = await getPuzzle(params, store);

  if (url.pathname === "/api/puzzle" && req.method === "GET") {
    return Response.json({
      date: puzzle.date,
      mode: puzzle.mode,
      length: puzzle.length,
      difficulty: puzzle.difficulty,
      pack: puzzle.pack,
      vocab: puzzle.vocab,
      rounds: puzzle.rounds.map((r) => ({ clues: r.clues })),
    });
  }

  if (url.pathname === "/api/guess" && req.method === "POST") {
    const input = await readRound(req, puzzle);
    if (input instanceof Response) return input;
    const { round, guess } = input;
    if (guess.length !== puzzle.length || !isAllowed(guess, puzzle.length, puzzle.pack)) return Response.json({ valid: false });
    const answer = puzzle.rounds[round]!.answer;
    return Response.json({ valid: true, correct: guess === answer, answer, feedback: scoreGuess(guess, answer) });
  }

  if (url.pathname === "/api/reveal" && req.method === "POST") {
    const input = await readRound(req, puzzle);
    if (input instanceof Response) return input;
    return Response.json({ answer: puzzle.rounds[input.round]!.answer });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
