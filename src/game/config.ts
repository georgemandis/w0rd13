export type Mode = "daily" | "bonus";
export type Difficulty = "easy" | "normal" | "hard" | "extreme";
export type Clock = "stopwatch" | "countdown";
export type Vocab = "standard" | "everyday";

export const DEFAULT_VOCAB: Vocab = "standard";
export const VOCABS: Record<Vocab, { name: string; blurb: string }> = {
  standard: { name: "Standard", blurb: "The full answer list." },
  everyday: { name: "Everyday", blurb: "Only the most common spoken words. Fewer candidates, easier puzzles." },
};

export function isVocab(v: unknown): v is Vocab {
  return v === "standard" || v === "everyday";
}

export const DEFAULT_CLOCK: Clock = "stopwatch";
/** Countdown mode: total time for all five words, and the cost of a wrong guess. */
export const COUNTDOWN_BUDGET_MS = 180_000;
export const COUNTDOWN_PENALTY_MS = 15_000;

export function isClock(v: unknown): v is Clock {
  return v === "stopwatch" || v === "countdown";
}

/**
 * Word themes: curated five-letter packs. "" means the full mixed list.
 * `loose` packs may include names and stylised spellings with digits (Prince's "die4u");
 * their words are accepted as guesses even when they are not dictionary words.
 */
export const PACKS: Record<string, { name: string; blurb: string; loose?: boolean }> = {
  animals: { name: "Animals", blurb: "Beasts, birds and things that bite." },
  food: { name: "Food & drink", blurb: "Everything on the menu." },
  body: { name: "Body parts", blurb: "From scalp to ankle." },
  music: { name: "Music", blurb: "Instruments, styles and stage words." },
  nature: { name: "The outdoors", blurb: "Weather, water and wild places." },
  colours: { name: "Colours", blurb: "Every shade from ashen to tawny." },
  purple: { name: "Purple Rain", blurb: "Song and album titles, names included, plus spellings like DIE4U.", loose: true },
  swift: { name: "Swiftie", blurb: "Taylor Swift song and album titles, a few names included.", loose: true },
  sports: { name: "Sports", blurb: "Courts, pitches, medals and the people chasing them." },
  space: { name: "Space", blurb: "Orbits, comets, and a couple of planets.", loose: true },
  spooky: { name: "Spooky", blurb: "Ghosts, ghouls and things in the crypt." },
  weather: { name: "Weather", blurb: "Everything the forecast might say." },
  jobs: { name: "Jobs", blurb: "Nurses, pilots, bakers and a ninja." },
  games: { name: "Games", blurb: "Cards, chess, and the words you say when you lose." },
  ocean: { name: "Ocean", blurb: "Whales, wharves and the briny deep." },
  feelings: { name: "Feelings", blurb: "Every mood from giddy to sulky." },
  tech: { name: "Tech", blurb: "Cache, debug, proxy: words from the terminal." },
  fashion: { name: "Fashion", blurb: "Tweed, denim, tiaras and vogue." },
  home: { name: "Home", blurb: "Porches, attics, quilts and the kitchen stove." },
  drinks: { name: "Drinks", blurb: "From mocha to vodka, and the morning after." },
};

/** Characters a guess may contain for this pack: letters, plus digits for loose packs. */
export function packAllowsDigits(pack: string): boolean {
  return Boolean(pack && PACKS[pack]?.loose);
}

export function isPack(v: unknown): v is string {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PACKS, v);
}

export const DIFFICULTIES: Record<Difficulty, { clues: number; label: string }> = {
  easy: { clues: 4, label: "Easy" },
  normal: { clues: 3, label: "Normal" },
  hard: { clues: 2, label: "Hard" },
  extreme: { clues: 1, label: "Extreme" },
};
export const DEFAULT_DIFFICULTY: Difficulty = "normal";
export const MIN_LENGTH = 3;
export const MAX_LENGTH = 10;
export const DEFAULT_LENGTH = 5;
export const ROUNDS_PER_PUZZLE = 5;

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && v in DIFFICULTIES;
}

export function isLength(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= MIN_LENGTH && v <= MAX_LENGTH;
}

/** "" for the default game, otherwise e.g. "Animals, hard, countdown" or "7 letters, everyday, extreme". */
export function variantLabel(length: number, difficulty: Difficulty, clock: Clock = DEFAULT_CLOCK, pack = "", vocab: Vocab = DEFAULT_VOCAB): string {
  const parts: string[] = [];
  if (pack && PACKS[pack]) parts.push(PACKS[pack].name);
  if (length !== DEFAULT_LENGTH && !pack) parts.push(`${length} letters`);
  if (vocab === "everyday" && !pack) parts.push("everyday");
  if (difficulty !== DEFAULT_DIFFICULTY) parts.push(DIFFICULTIES[difficulty].label.toLowerCase());
  if (clock === "countdown") parts.push("countdown");
  return parts.join(", ");
}

/** Today's puzzle date in the player's local timezone, as YYYY-MM-DD. */
export function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
