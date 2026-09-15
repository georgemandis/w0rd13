import { generatePuzzle, localDateString, type Puzzle, type PuzzleOptions } from "./game/puzzle";
import { DEFAULT_DIFFICULTY, DEFAULT_LENGTH, DEFAULT_VOCAB, DEFAULT_KIND, isDifficulty, isKind, isLength, isPack, isVocab } from "./game/config";
import { scoreGuess } from "./game/feedback";
import { wordsForLength } from "./words";
import { PACK_WORDS } from "./words/packs";
import { HUBS } from "./words/hubs";
import { NEIGHBORS } from "./words/neighbors";

/**
 * The game API, written against the standard Request/Response types so the
 * same code runs under Bun (src/server.ts) and Cloudflare Workers (src/worker.ts).
 *
 *   GET  /api/puzzle?date&mode&length&difficulty&pack&vocab  -> clues only
 *   POST /api/guess  {round, guess, final?}             -> validity, answer, feedback
 *                    (orbit: answer only when correct or final; interim misses still get letter feedback,
 *                     plus `near`, the guess's rank among the secret's 25 nearest neighbours, or null)
 *   POST /api/reveal {round}                            -> answer (countdown blew up)
 *   POST /api/edges  {words}                            -> how the given words relate to each other (Orbit board)
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
  const key = `${opts.mode}:${opts.date}:${opts.length}:${opts.difficulty}:${opts.pack}:${opts.vocab}:${opts.kind}`;
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
  const kind = q.get("kind") ?? DEFAULT_KIND;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("bad date");
  // Past dates are fine (replaying a missed day); tomorrow is allowed for players ahead of UTC, nothing beyond.
  if (date > localDateString(new Date(Date.now() + 36 * 3600 * 1000))) return bad("date is in the future");
  if (mode !== "daily" && mode !== "bonus") return bad("bad mode");
  if (!isLength(length)) return bad("bad length");
  if (!isDifficulty(difficulty)) return bad("bad difficulty");
  if (packParam && !isPack(packParam)) return bad("bad pack");
  if (!isVocab(vocab)) return bad("bad vocab");
  if (!isKind(kind)) return bad("bad kind");
  // Word themes are five-letter only; other lengths fall back to the mixed list.
  const pack = length === DEFAULT_LENGTH ? packParam : "";
  // Orbit is always five letters with the standard vocabulary.
  if (kind === "orbit") return { date, mode, length: DEFAULT_LENGTH, difficulty, pack: packParam, vocab: DEFAULT_VOCAB, kind };
  return { date, mode, length, difficulty, pack, vocab: pack ? DEFAULT_VOCAB : vocab, kind };
}

async function readRound(req: Request, puzzle: Puzzle): Promise<{ round: number; guess: string; final: boolean } | Response> {
  const body = (await req.json().catch(() => null)) as { round?: unknown; guess?: unknown; final?: unknown } | null;
  const round = body?.round;
  if (typeof round !== "number" || !puzzle.rounds[round]) return bad("bad round");
  return { round, guess: String(body?.guess ?? "").toLowerCase(), final: body?.final === true };
}

export interface Edge { a: string; b: string; s: number }

/**
 * Relatedness among a set of words: an edge where one is among the other's 25 nearest
 * neighbours, with strength falling from 1 (nearest) towards 0 (25th). Symmetric: the
 * stronger direction wins.
 */
export function edgesAmong(words: string[]): Edge[] {
  const set = new Set(words);
  const best = new Map<string, Edge>();
  for (const a of set) {
    const list = NEIGHBORS[a];
    if (!list) continue;
    list.forEach((b, i) => {
      if (!set.has(b) || b === a) return;
      const s = Math.round((1 - i / list.length) * 100) / 100;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const cur = best.get(key);
      if (!cur || s > cur.s) best.set(key, { a: a < b ? a : b, b: a < b ? b : a, s });
    });
  }
  return [...best.values()].sort((x, y) => y.s - x.s);
}

/** Returns a Response for /api/* requests, or null if the path is not an API route. */
export async function handleApi(req: Request, store?: PuzzleStore): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (url.pathname === "/api/edges" && req.method === "POST") {
    const body = (await req.json().catch(() => null)) as { words?: unknown } | null;
    const words = Array.isArray(body?.words) ? body!.words.filter((w): w is string => typeof w === "string" && /^[a-z0-9]{1,12}$/.test(w)).slice(0, 60) : [];
    return Response.json({ edges: edgesAmong(words) });
  }
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
      kind: puzzle.kind,
      rounds: puzzle.rounds.map((r) => ({ clues: r.clues, hub: r.hub, theme: r.theme })),
    });
  }

  if (url.pathname === "/api/guess" && req.method === "POST") {
    const input = await readRound(req, puzzle);
    if (input instanceof Response) return input;
    const { round, guess, final } = input;
    if (guess.length !== puzzle.length || !isAllowed(guess, puzzle.length, puzzle.pack)) return Response.json({ valid: false });
    const answer = puzzle.rounds[round]!.answer;
    const correct = guess === answer;
    if (puzzle.kind === "orbit" && !correct && !final) {
      const i = (HUBS[answer] ?? []).indexOf(guess);
      return Response.json({ valid: true, correct: false, near: i >= 0 ? i + 1 : null, feedback: scoreGuess(guess, answer) });
    }
    return Response.json({ valid: true, correct, answer, feedback: scoreGuess(guess, answer) });
  }

  if (url.pathname === "/api/reveal" && req.method === "POST") {
    const input = await readRound(req, puzzle);
    if (input instanceof Response) return input;
    return Response.json({ answer: puzzle.rounds[input.round]!.answer });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
